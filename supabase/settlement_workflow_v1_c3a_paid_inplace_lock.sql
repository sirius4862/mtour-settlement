-- settlement workflow v1 — C3a hotfix: paid in-place lock (before workflow shortcut)
-- Authority: docs/workflow_decision_v1.md
-- Run AFTER settlement_workflow_v1_c3_master_paid_lock.sql on staging.
--
-- Fixes C3a: enforce_settlement_workflow early RETURN NEW skipped master paid lock
-- when only financial columns changed (status/paid_at/confirm flags unchanged).
--
-- Layer 1: global paid+paid reject BEFORE workflow-column no-op shortcut (trigger only)
-- Layer 2: master RLS policies (no OLD/NEW — invalid in RLS; paid in-place lock is trigger-only)
-- Safe to re-run: CREATE OR REPLACE + DROP POLICY IF EXISTS.

BEGIN;

-- ── Layer 1: workflow trigger ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_settlement_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- C3a: reject any in-place edit while status stays paid (all roles; before no-op shortcut)
  IF OLD.status = 'paid'::public.settlement_status
     AND NEW.status = 'paid'::public.settlement_status THEN
    RAISE EXCEPTION 'Cannot modify paid settlement';
  END IF;

  IF OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.paid_at IS NOT DISTINCT FROM NEW.paid_at
     AND OLD.guide_confirmed_at IS NOT DISTINCT FROM NEW.guide_confirmed_at
     AND OLD.guide_confirmed_by IS NOT DISTINCT FROM NEW.guide_confirmed_by
     AND OLD.reviewed_at IS NOT DISTINCT FROM NEW.reviewed_at
     AND OLD.reviewed_by IS NOT DISTINCT FROM NEW.reviewed_by THEN
    RETURN NEW;
  END IF;

  -- ── Guide (not admin tier) ────────────────────────────────────────────────
  IF OLD.guide_id = auth.uid()
     AND public.auth_user_is_guide()
     AND NOT public.auth_user_is_admin_tier() THEN

    IF OLD.status IS DISTINCT FROM NEW.status THEN
      IF OLD.status IN ('draft', 'rejected', 'edit_requested')
         AND NEW.status = 'submitted' THEN
        RETURN NEW;
      END IF;

      IF OLD.status = 'pending_guide_confirmation'
         AND NEW.status = 'edit_requested' THEN
        RETURN NEW;
      END IF;

      IF OLD.status = 'pending_guide_confirmation'
         AND NEW.status IN ('approved', 'clarification_requested') THEN
        RETURN NEW;
      END IF;

      RAISE EXCEPTION 'Guide settlement status transition not allowed: % -> %', OLD.status, NEW.status;
    END IF;

    IF NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
      RAISE EXCEPTION 'Guide cannot modify paid_at';
    END IF;

    IF NEW.guide_confirmed_at IS DISTINCT FROM OLD.guide_confirmed_at
       OR NEW.guide_confirmed_by IS DISTINCT FROM OLD.guide_confirmed_by THEN
      IF OLD.status <> 'pending_guide_confirmation'
         OR NEW.status <> 'pending_guide_confirmation' THEN
        RAISE EXCEPTION 'Guide cannot modify guide confirmation outside pending_guide_confirmation';
      END IF;
      IF OLD.guide_confirmed_at IS NOT NULL
         AND NEW.guide_confirmed_at IS DISTINCT FROM OLD.guide_confirmed_at THEN
        RAISE EXCEPTION 'Guide confirmation already recorded';
      END IF;
      RETURN NEW;
    END IF;

    RETURN NEW;
  END IF;

  -- ── Plain admin (role = admin) ────────────────────────────────────────────
  IF public.auth_user_is_plain_admin() AND NOT public.auth_user_is_master_admin() THEN

    IF OLD.status IS DISTINCT FROM NEW.status THEN
      IF OLD.status IN ('submitted', 'clarification_requested')
         AND NEW.status IN (
           'submitted',
           'clarification_requested',
           'edit_requested',
           'pending_guide_confirmation',
           'rejected'
         ) THEN
        RETURN NEW;
      END IF;

      IF OLD.status = 'pending_guide_confirmation'
         AND NEW.status = 'paid'
         AND OLD.guide_confirmed_at IS NOT NULL THEN
        RETURN NEW;
      END IF;

      IF OLD.status = 'approved' AND NEW.status = 'paid' THEN
        RETURN NEW;
      END IF;

      RAISE EXCEPTION 'Admin settlement status transition not allowed: % -> %', OLD.status, NEW.status;
    END IF;

    IF OLD.status = 'paid' THEN
      IF NEW.paid_at IS DISTINCT FROM OLD.paid_at
         OR NEW.guide_confirmed_at IS DISTINCT FROM OLD.guide_confirmed_at
         OR NEW.guide_confirmed_by IS DISTINCT FROM OLD.guide_confirmed_by
         OR OLD.status IS DISTINCT FROM NEW.status THEN
        RAISE EXCEPTION 'Admin cannot modify paid settlement workflow fields';
      END IF;
    END IF;

    IF OLD.status = 'approved' AND NEW.status = 'approved' THEN
      IF NEW.paid_at IS DISTINCT FROM OLD.paid_at
         OR NEW.guide_confirmed_at IS DISTINCT FROM OLD.guide_confirmed_at
         OR NEW.guide_confirmed_by IS DISTINCT FROM OLD.guide_confirmed_by THEN
        RAISE EXCEPTION 'Admin cannot modify approved settlement except via pay transition';
      END IF;
    END IF;

    IF NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
      IF NEW.status = 'paid'
         AND OLD.status IN ('pending_guide_confirmation', 'approved') THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Admin cannot modify paid_at outside pay transition';
    END IF;

    RETURN NEW;
  END IF;

  -- ── Master admin — pay + reopen (C3 transition lock) ───────────────────────
  IF public.auth_user_is_master_admin() THEN

    IF OLD.status = 'paid'::public.settlement_status THEN
      IF NEW.status = 'edit_requested'::public.settlement_status
         AND NEW.paid_at IS NULL
         AND NEW.guide_confirmed_at IS NULL
         AND NEW.guide_confirmed_by IS NULL THEN
        RETURN NEW;
      END IF;

      RAISE EXCEPTION 'Master cannot transition paid settlement to %', NEW.status;
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
      IF OLD.status IN ('submitted', 'clarification_requested')
         AND NEW.status IN (
           'submitted',
           'clarification_requested',
           'edit_requested',
           'pending_guide_confirmation',
           'rejected'
         ) THEN
        RETURN NEW;
      END IF;

      IF OLD.status = 'pending_guide_confirmation'
         AND NEW.status = 'paid'
         AND OLD.guide_confirmed_at IS NOT NULL THEN
        RETURN NEW;
      END IF;

      IF OLD.status = 'approved' AND NEW.status = 'paid' THEN
        RETURN NEW;
      END IF;

      RAISE EXCEPTION 'Master settlement status transition not allowed: % -> %', OLD.status, NEW.status;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_settlement_workflow ON public.settlements;
CREATE TRIGGER trg_enforce_settlement_workflow
  BEFORE UPDATE ON public.settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_settlement_workflow();

-- ── Layer 2: master RLS (valid expressions only; no OLD/NEW) ────────────────

DROP POLICY IF EXISTS settlements_paid_inplace_deny ON public.settlements;
DROP POLICY IF EXISTS settlements_master_admin_update ON public.settlements;
DROP POLICY IF EXISTS settlements_master_reopen_paid ON public.settlements;

CREATE POLICY settlements_master_admin_update
  ON public.settlements
  FOR UPDATE
  TO authenticated
  USING (
    public.auth_user_is_master_admin()
    AND status IS DISTINCT FROM 'paid'::public.settlement_status
  )
  WITH CHECK (
    public.auth_user_is_master_admin()
    AND (
      status IS DISTINCT FROM 'paid'::public.settlement_status
      OR (
        status = 'paid'::public.settlement_status
        AND paid_at IS NOT NULL
        AND guide_confirmed_at IS NOT NULL
      )
    )
  );

CREATE POLICY settlements_master_reopen_paid
  ON public.settlements
  FOR UPDATE
  TO authenticated
  USING (
    public.auth_user_is_master_admin()
    AND status = 'paid'::public.settlement_status
  )
  WITH CHECK (
    public.auth_user_is_master_admin()
    AND status = 'edit_requested'::public.settlement_status
    AND paid_at IS NULL
    AND guide_confirmed_at IS NULL
    AND guide_confirmed_by IS NULL
  );

COMMIT;

-- Verify: supabase/verify_c3_master_paid_lock.sql (includes C3a checks)
