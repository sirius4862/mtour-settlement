-- ============================================================================
-- 배정회수 (ASSIGNMENT RECALL) v1 migration
-- Authority: docs/workflow_decision_v1.md
-- Run in Supabase Dashboard → SQL Editor on PRODUCTION.
-- Builds on the current production trigger:
--   settlement_workflow_v1_c3_paid_lock_plus_recall.sql
--
-- WHAT THIS ADDS
--   • tours.assignment_status ('assigned' | 'recalled'), tours.recalled_at,
--     tours.recalled_by — to mark a wrong guide assignment as recalled.
--   • settlement_status enum value 'recalled' (배정회수).
--   • Trigger: admin/master may transition draft/submitted → recalled (only when
--     guide_confirmed_at IS NULL). Guides can never reach 'recalled'. Paid rows
--     can never become 'recalled'. Every existing C3a paid-lock / role rule and
--     the two existing 회수→submitted transitions are preserved BYTE-FOR-BYTE.
--   • Guide visibility: recalled tours and recalled settlements (and settlements
--     whose tour is recalled) disappear from guide-facing reads.
--   • One additive RLS policy so a PLAIN admin may write draft/submitted → recalled
--     (master already qualifies via settlements_master_admin_update).
--
-- NOT CHANGED: calculation, payout, company profit, receipt/storage, guide diff,
-- monetary fields, paid_at, guide_confirmed_at/by, guide change (never added),
-- and the C3 / master paid-lock behavior.
--
-- ⚠ ENUM ORDERING / IRREVERSIBILITY
--   PostgreSQL cannot use a newly added enum value in the SAME transaction that
--   adds it, and enum values can NEVER be dropped. Therefore this file is split:
--     STEP 1 — run ALONE first (adds the enum value, commits).
--     STEP 2 — run AFTER step 1 (uses 'recalled' in trigger/view/policy).
--   Run STEP 1, confirm success, THEN run STEP 2 as a separate execution.
-- ============================================================================


-- ============================================================================
-- STEP 1 — run this statement ALONE first, then run STEP 2 separately.
-- ============================================================================
ALTER TYPE public.settlement_status ADD VALUE IF NOT EXISTS 'recalled';


-- ============================================================================
-- STEP 2 — run AFTER STEP 1 has committed.
-- ============================================================================
BEGIN;

-- ── Tours: assignment recall columns ─────────────────────────────────────────
ALTER TABLE public.tours
  ADD COLUMN IF NOT EXISTS assignment_status text NOT NULL DEFAULT 'assigned',
  ADD COLUMN IF NOT EXISTS recalled_at timestamptz,
  ADD COLUMN IF NOT EXISTS recalled_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tours_assignment_status_check'
  ) THEN
    ALTER TABLE public.tours
      ADD CONSTRAINT tours_assignment_status_check
      CHECK (assignment_status IN ('assigned', 'recalled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tours_recalled_by_fkey'
  ) THEN
    ALTER TABLE public.tours
      ADD CONSTRAINT tours_recalled_by_fkey
      FOREIGN KEY (recalled_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Tours RLS: hide recalled tours from the assigned guide ───────────────────
DROP POLICY IF EXISTS tours_select ON public.tours;
CREATE POLICY tours_select
  ON public.tours
  FOR SELECT
  TO authenticated
  USING (
    (guide_id = auth.uid() AND assignment_status IS DISTINCT FROM 'recalled')
    OR public.auth_user_is_admin_tier()
  );

-- ── Guide read view: hide recalled settlements + settlements of recalled tours
-- Column list identical to settlement_rls_hardening_migration.sql (CREATE OR
-- REPLACE requires the same columns/order); only the WHERE clause is extended.
CREATE OR REPLACE VIEW public.settlements_guide_read
WITH (security_barrier = true) AS
SELECT
  s.id,
  s.tour_id,
  s.guide_id,
  s.branch_id,
  s.status,
  s.year_month,
  s.exchange_rate,
  s.advance_vnd,
  s.tour_fee_usd,
  0::numeric AS ground_fee_usd,
  s.charming_other_usd,
  s.tip_received_usd,
  s.option_receivable_usd,
  s.tip_transfer_usd,
  s.option_credit_usd,
  0::numeric AS vehicle_fee_usd,
  0::numeric AS head_tax_usd,
  0::numeric AS seoul_biz_fee_usd,
  s.tc_guide_usd,
  0::numeric AS tc_company_usd,
  s.megugi_usd,
  s.guide_daily_fee_usd,
  s.settlement_ratio,
  s.guide_note,
  s.admin_note,
  s.reject_reason,
  s.submitted_at,
  s.reviewed_at,
  s.paid_at,
  s.edit_requested_at,
  s.reviewed_by,
  s.edit_requested_by,
  s.sent_for_confirmation_at,
  s.sent_for_confirmation_by,
  s.guide_confirmed_at,
  s.guide_confirmed_by,
  s.clarification_requested_at,
  s.clarification_message,
  s.active_confirmation_id,
  s.guide_submit_snapshot_id,
  public.redact_calc_summary_json_for_guide(s.calc_summary_json) AS calc_summary_json,
  s.created_at,
  s.updated_at
FROM public.settlements s
WHERE s.guide_id = auth.uid()
  AND s.status <> 'recalled'::public.settlement_status
  AND NOT EXISTS (
    SELECT 1 FROM public.tours t
    WHERE t.id = s.tour_id
      AND t.assignment_status = 'recalled'
  );

GRANT SELECT ON public.settlements_guide_read TO authenticated;

-- ── Workflow trigger — C3a + 회수 (verbatim) + assignment-recall transitions ──
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

      -- ASSIGNMENT RECALL (배정회수): pull back a wrong assignment from an early
      -- state. Only draft/submitted and never once guide-confirmed. Status-only.
      IF OLD.status IN ('draft', 'submitted')
         AND NEW.status = 'recalled'
         AND OLD.guide_confirmed_at IS NULL THEN
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

      -- ASSIGNMENT RECALL (배정회수): pull back a wrong assignment from an early
      -- state. Only draft/submitted and never once guide-confirmed. Status-only.
      IF OLD.status IN ('draft', 'submitted')
         AND NEW.status = 'recalled'
         AND OLD.guide_confirmed_at IS NULL THEN
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

-- ── Additive RLS: admin tier may write draft/submitted → recalled ────────────
-- Plain admin needs this (settlements_admin_update USING covers only
-- submitted/clarification and its WITH CHECK excludes 'recalled'). master_admin
-- already qualifies via settlements_master_admin_update; included here for clarity.
-- Permissive policies are OR'd, so this coexists with existing UPDATE policies.
DROP POLICY IF EXISTS settlements_assignment_recall_update ON public.settlements;
CREATE POLICY settlements_assignment_recall_update
  ON public.settlements
  FOR UPDATE
  TO authenticated
  USING (
    public.auth_user_is_admin_tier()
    AND status IN ('draft', 'submitted')
    AND guide_confirmed_at IS NULL
  )
  WITH CHECK (
    public.auth_user_is_admin_tier()
    AND status = 'recalled'
  );

COMMIT;

-- ── Production spot-checks (read-only, BEFORE app deploy) ──────────────────
-- Full checklist: supabase/verify_assignment_recall_v1_schema.sql
-- Run every query in that file after STEP 1 + STEP 2, before deploying app code.
