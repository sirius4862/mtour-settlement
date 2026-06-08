-- ============================================================================
-- VEHICLE COMPANY REPORT v1.2 — guide assignment-recall cleanup RPC
-- Run in Supabase Dashboard → SQL Editor on PRODUCTION, AFTER:
--   1. vehicle_company_v1_step1_enum.sql
--   2. vehicle_company_v1_step2_schema.sql
--   3. assignment_recall_v1_1_tour_recall_guard.sql
--
-- WHY:
--   When a guide assignment is recalled (배정회수), the vehicle company side must
--   be cleared together: vehicle reports embed guide information and become
--   invalid after reassignment. vehicle_route_reports has UNIQUE(tour_id), so a
--   stale report would block the next company from creating a fresh report.
--
-- DESIGN:
--   This is an admin-gated SECURITY DEFINER RPC that performs ONLY the vehicle
--   cleanup. We deliberately do NOT grant a standing DELETE privilege on
--   public.vehicle_route_reports to authenticated users — the delete happens
--   inside this controlled function, as the function owner, in one transaction.
--
--   recallTourAssignment() still owns:
--     * recall eligibility (settlement draft/submitted, never guide-confirmed)
--     * the tours.assignment_status → 'recalled' transition
--     * the settlement status-only transition (draft/submitted → recalled)
--   This function runs AFTER those, and only for an already-recalled tour.
--
-- SAFETY — this function does NOT touch:
--   * settlement calculation / payout / company profit / guide payout
--   * settlement status flow (only the existing action moves the settlement)
--   * paid-lock (paid_at) or guide final confirmation (guide_confirmed_at)
--   * the settlement submit RPC
--   * any settlements columns
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.recall_tour_vehicle_cleanup(p_tour_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tour            public.tours%ROWTYPE;
  v_deleted_reports integer := 0;
BEGIN
  -- 1) Admin tier only (mirrors recallTourAssignment + the recall guard trigger).
  IF NOT public.auth_user_is_admin_tier() THEN
    RAISE EXCEPTION 'Vehicle recall cleanup requires admin tier';
  END IF;

  SELECT * INTO v_tour FROM public.tours WHERE id = p_tour_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tour % not found', p_tour_id;
  END IF;

  -- 2) Cleanup runs ONLY for an actually-recalled tour. Recall eligibility
  --    (settlement draft/submitted, never guide-confirmed) was already enforced
  --    by recallTourAssignment() + trg_enforce_tour_assignment_recall before this.
  IF v_tour.assignment_status IS NULL OR v_tour.assignment_status <> 'recalled' THEN
    RAISE EXCEPTION 'Vehicle recall cleanup requires a recalled tour assignment';
  END IF;

  -- 3) Region scope as defense-in-depth (the app action already checks region).
  --    master_admin oversees all; a plain admin is limited to their own branch.
  IF NOT public.auth_user_is_master_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.branch_id = v_tour.branch_id
    ) THEN
      RAISE EXCEPTION 'Vehicle recall cleanup not allowed for this region';
    END IF;
  END IF;

  -- 4) Delete the tour's vehicle route report(s). Related vehicle_report_checks
  --    are removed automatically via ON DELETE CASCADE on checks.report_id.
  DELETE FROM public.vehicle_route_reports WHERE tour_id = p_tour_id;
  GET DIAGNOSTICS v_deleted_reports = ROW_COUNT;

  -- 5) Clear the assignment. The branch-match trigger early-returns on NULL and
  --    the recall guard trigger is a no-op when assignment_status is unchanged.
  UPDATE public.tours SET vehicle_company_id = NULL WHERE id = p_tour_id;

  RETURN v_deleted_reports;
END;
$$;

-- Option C: no standing DELETE on vehicle_route_reports for authenticated.
-- Idempotent hardening — GRANT SELECT, INSERT, UPDATE (step 2) does not revoke
-- a DELETE privilege that may already exist; only the SECURITY DEFINER RPC may delete.
REVOKE DELETE ON TABLE public.vehicle_route_reports FROM authenticated;

-- Execute only by authenticated; the function body gates to admin tier.
REVOKE ALL ON FUNCTION public.recall_tour_vehicle_cleanup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recall_tour_vehicle_cleanup(uuid) TO authenticated;

COMMIT;

-- ============================================================================
-- NOTES (NOT executed)
-- ----------------------------------------------------------------------------
-- * Idempotent: CREATE OR REPLACE FUNCTION + REVOKE/GRANT are safe to re-run.
-- * Atomic: the DELETE (+ cascade) and the column clear run in one transaction.
-- * No standing DELETE grant: authenticated cannot delete vehicle_route_reports
--   directly; only this admin-gated function can, as its owner.
-- ============================================================================
