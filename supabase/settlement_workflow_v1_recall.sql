-- settlement workflow v1 — RECALL (회수)
-- Authority: builds on settlement_workflow_v1_p0_enforce_and_admin_rls.sql
-- Run in Supabase Dashboard → SQL Editor AFTER settlement_workflow_v1_p0_enforce_and_admin_rls.sql
--
-- Purpose: let admin/master_admin recall a settlement that was sent to the guide
-- (최종확인 또는 수정요청) back to admin review (submitted), before the guide gives
-- final confirmation and never once paid.
--
-- This migration is ADDITIVE and surgical:
--   • Trigger: adds exactly two plain-admin recall transitions:
--       - pending_guide_confirmation (guide_confirmed_at IS NULL) -> submitted
--       - edit_requested                                          -> submitted
--     All existing transitions are preserved verbatim. master_admin already
--     permits any transition (catch-all RETURN NEW) and is left unchanged.
--   • RLS: adds a dedicated permissive UPDATE policy so a plain admin can target
--     the recall-eligible rows. The existing settlements_admin_update policy is
--     left untouched. master_admin already has a permissive update policy.
--
-- No calculation/payout/company-profit/paid-lock logic is changed. Paid rows stay
-- locked (recall transitions do not include OLD.status = 'paid'). Guides are never
-- granted recall (guide branch unchanged).
--
-- Safe to re-run: CREATE OR REPLACE + DROP POLICY IF EXISTS.

BEGIN;

-- ── Trigger: re-create enforce_settlement_workflow with recall transitions ────

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

      -- RECALL (회수): pull back before guide final confirmation → admin review
      IF OLD.status = 'pending_guide_confirmation'
         AND OLD.guide_confirmed_at IS NULL
         AND NEW.status = 'submitted' THEN
        RETURN NEW;
      END IF;

      -- RECALL (회수): pull back a 수정요청 sent to the guide → admin review
      IF OLD.status = 'edit_requested'
         AND NEW.status = 'submitted' THEN
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

  -- ── Master admin — pay + reopen + recall (RLS permissive) ────────────────
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

-- Trigger binding is unchanged; re-assert for idempotency.
DROP TRIGGER IF EXISTS trg_enforce_settlement_workflow ON public.settlements;
CREATE TRIGGER trg_enforce_settlement_workflow
  BEFORE UPDATE ON public.settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_settlement_workflow();

-- ── RLS: dedicated plain-admin recall UPDATE policy (additive) ────────────────
-- Lets a plain admin target the recall-eligible rows (unconfirmed 최종확인 and
-- 수정요청) and write the row back as `submitted`. The workflow trigger above is
-- the real transition guard; this only widens which rows the admin may UPDATE.

DROP POLICY IF EXISTS settlements_admin_recall ON public.settlements;

CREATE POLICY settlements_admin_recall
  ON public.settlements
  FOR UPDATE
  TO authenticated
  USING (
    public.auth_user_is_plain_admin()
    AND (
      (status = 'pending_guide_confirmation' AND guide_confirmed_at IS NULL)
      OR status = 'edit_requested'
    )
  )
  WITH CHECK (
    public.auth_user_is_plain_admin()
    AND status = 'submitted'
  );

COMMIT;

-- ── Staging spot-check ───────────────────────────────────────────────────────
-- SELECT pg_get_functiondef('public.enforce_settlement_workflow()'::regprocedure);
--
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'settlements' AND policyname = 'settlements_admin_recall';
