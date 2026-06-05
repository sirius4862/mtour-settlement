-- settlement workflow v1 — P0: enforce_settlement_workflow + settlements_admin_update
-- Authority: docs/workflow_decision_v1.md
-- Run in Supabase Dashboard → SQL Editor AFTER settlement_rls_hardening_migration.sql
--
-- P0 changes:
--   • Guide confirm (이상없음): guide_confirmed_* on pending_guide_confirmation, status unchanged
--   • Guide pending → edit_requested (v1); legacy pending → approved/clarification_requested kept
--   • Plain admin pay: pending_guide_confirmation + guide_confirmed_at → paid; legacy approved → paid
--   • Plain admin lock after paid only (not after approved)
--   • settlements_admin_update USING/WITH CHECK aligned for v1 pay flow
--
-- Does NOT normalize legacy status values (approved / rejected / clarification_requested).
-- Safe to re-run: CREATE OR REPLACE + DROP POLICY IF EXISTS.

BEGIN;

-- ── P0-1: Workflow trigger ───────────────────────────────────────────────────

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

      -- v1: 최종확인 → 수정요청
      IF OLD.status = 'pending_guide_confirmation'
         AND NEW.status = 'edit_requested' THEN
        RETURN NEW;
      END IF;

      -- Legacy paths until status normalization phase (no new app rows)
      IF OLD.status = 'pending_guide_confirmation'
         AND NEW.status IN ('approved', 'clarification_requested') THEN
        RETURN NEW;
      END IF;

      RAISE EXCEPTION 'Guide settlement status transition not allowed: % -> %', OLD.status, NEW.status;
    END IF;

    IF NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
      RAISE EXCEPTION 'Guide cannot modify paid_at';
    END IF;

    -- v1: 이상없음 — confirmation flags only; status stays pending_guide_confirmation
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

      -- Legacy pay until approved rows are normalized
      IF OLD.status = 'approved' AND NEW.status = 'paid' THEN
        RETURN NEW;
      END IF;

      RAISE EXCEPTION 'Admin settlement status transition not allowed: % -> %', OLD.status, NEW.status;
    END IF;

    -- v1: read-only after paid (admin may still pay legacy approved rows)
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

  -- ── Master admin — pay + reopen (RLS permissive) ─────────────────────────
  IF public.auth_user_is_master_admin() THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      IF OLD.status = 'paid' AND NEW.status = 'edit_requested' THEN
        RETURN NEW;
      END IF;
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

-- ── P0-2: Plain admin UPDATE policy ─────────────────────────────────────────

DROP POLICY IF EXISTS settlements_admin_update ON public.settlements;

CREATE POLICY settlements_admin_update
  ON public.settlements
  FOR UPDATE
  TO authenticated
  USING (
    public.auth_user_is_plain_admin()
    AND (
      status IN ('submitted', 'clarification_requested')
      OR (
        status = 'pending_guide_confirmation'
        AND guide_confirmed_at IS NOT NULL
      )
      OR status = 'approved'
    )
  )
  WITH CHECK (
    public.auth_user_is_plain_admin()
    AND status IN (
      'submitted',
      'clarification_requested',
      'edit_requested',
      'pending_guide_confirmation',
      'paid',
      'rejected'
    )
  );

COMMIT;

-- ── Staging spot-check (P0) ──────────────────────────────────────────────────
-- SELECT pg_get_functiondef('public.enforce_settlement_workflow()'::regprocedure);
--
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'settlements' AND policyname = 'settlements_admin_update';
