-- ============================================================================
-- VEHICLE COMPANY REPORT v2 — profile-based assignment (additive cutover)
-- Run in Supabase Dashboard → SQL Editor on PRODUCTION, AFTER:
--   1. vehicle_company_v1_step1_enum.sql
--   2. vehicle_company_v1_step2_schema.sql
--   3. vehicle_company_v1_2_recall_cleanup_rpc.sql  (optional; this file replaces the RPC body)
--
-- PURPOSE:
--   A vehicle company IS a profile account (role = vehicle_company). Admin assigns
--   profiles directly to tours. The v1 registry (vehicle_companies) and link table
--   (vehicle_company_users) are deprecated — NOT dropped — for rollback safety.
--
-- SAFETY — this migration does NOT touch:
--   * settlements table / columns
--   * settlement submit RPC
--   * settlement status flow / paid-lock / guide final confirmation
--   * payout / calculation formulas
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. tours.vehicle_company_profile_id  (nullable assignment → profiles)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tours
  ADD COLUMN IF NOT EXISTS vehicle_company_profile_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tours_vehicle_company_profile_id_fkey'
  ) THEN
    ALTER TABLE public.tours
      ADD CONSTRAINT tours_vehicle_company_profile_id_fkey
      FOREIGN KEY (vehicle_company_profile_id)
      REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tours_vehicle_company_profile_id
  ON public.tours (vehicle_company_profile_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. vehicle_route_reports.vehicle_company_profile_id  (ownership → profiles)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.vehicle_route_reports
  ADD COLUMN IF NOT EXISTS vehicle_company_profile_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_route_reports_vehicle_company_profile_id_fkey'
  ) THEN
    ALTER TABLE public.vehicle_route_reports
      ADD CONSTRAINT vehicle_route_reports_vehicle_company_profile_id_fkey
      FOREIGN KEY (vehicle_company_profile_id)
      REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vehicle_route_reports_vehicle_company_profile_id
  ON public.vehicle_route_reports (vehicle_company_profile_id);

-- Allow new inserts that only set vehicle_company_profile_id (v1 column kept for rollback).
ALTER TABLE public.vehicle_route_reports
  ALTER COLUMN vehicle_company_id DROP NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Backfill from v1 registry mapping (best-effort; orphans stay NULL)
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.tours t
SET vehicle_company_profile_id = vcu.profile_id
FROM public.vehicle_company_users vcu
WHERE t.vehicle_company_id IS NOT NULL
  AND t.vehicle_company_id = vcu.vehicle_company_id
  AND t.vehicle_company_profile_id IS NULL;

UPDATE public.vehicle_route_reports r
SET vehicle_company_profile_id = vcu.profile_id
FROM public.vehicle_company_users vcu
WHERE r.vehicle_company_id IS NOT NULL
  AND r.vehicle_company_id = vcu.vehicle_company_id
  AND r.vehicle_company_profile_id IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Helper functions — profile-based ownership (auth.uid())
-- ────────────────────────────────────────────────────────────────────────────

-- Returns auth.uid() when the caller is a vehicle_company-role user; NULL otherwise.
CREATE OR REPLACE FUNCTION public.auth_user_vehicle_company_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.auth_user_is_vehicle_company() THEN auth.uid()
    ELSE NULL::uuid
  END;
$$;

-- Repurpose legacy helper for profile model (no longer reads vehicle_company_users).
CREATE OR REPLACE FUNCTION public.auth_user_vehicle_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_user_vehicle_company_profile_id();
$$;

CREATE OR REPLACE FUNCTION public.vehicle_company_owns_tour(p_tour_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tours t
    WHERE t.id = p_tour_id
      AND t.vehicle_company_profile_id IS NOT NULL
      AND t.vehicle_company_profile_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.auth_user_vehicle_company_profile_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_vehicle_company_profile_id() TO authenticated;

REVOKE ALL ON FUNCTION public.auth_user_vehicle_company_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_vehicle_company_id() TO authenticated;

REVOKE ALL ON FUNCTION public.vehicle_company_owns_tour(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vehicle_company_owns_tour(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Branch-match trigger — profiles.branch_id for vehicle_company_profile_id
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_tour_vehicle_company_branch_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_branch uuid;
  v_profile_role   public.user_role;
  v_company_branch uuid;
BEGIN
  -- Profile-based assignment (v2 primary path).
  IF NEW.vehicle_company_profile_id IS NOT NULL THEN
    IF TG_OP = 'UPDATE'
       AND NEW.vehicle_company_profile_id IS NOT DISTINCT FROM OLD.vehicle_company_profile_id THEN
      RETURN NEW;
    END IF;

    SELECT p.branch_id, p.role
      INTO v_profile_branch, v_profile_role
    FROM public.profiles p
    WHERE p.id = NEW.vehicle_company_profile_id;

    IF v_profile_branch IS NULL AND v_profile_role IS NULL THEN
      RAISE EXCEPTION 'Vehicle company profile % not found', NEW.vehicle_company_profile_id;
    END IF;

    IF v_profile_role IS DISTINCT FROM 'vehicle_company'::public.user_role THEN
      RAISE EXCEPTION 'Profile % is not a vehicle_company account', NEW.vehicle_company_profile_id;
    END IF;

    IF v_profile_branch IS DISTINCT FROM NEW.branch_id THEN
      RAISE EXCEPTION
        'Vehicle company profile branch (%) must match tour branch (%)',
        v_profile_branch, NEW.branch_id;
    END IF;
  END IF;

  -- Legacy v1 path (kept for rollback reads; app no longer writes this column).
  IF NEW.vehicle_company_id IS NOT NULL THEN
    IF TG_OP = 'UPDATE'
       AND NEW.vehicle_company_id IS NOT DISTINCT FROM OLD.vehicle_company_id THEN
      RETURN NEW;
    END IF;

    SELECT vc.branch_id INTO v_company_branch
    FROM public.vehicle_companies vc
    WHERE vc.id = NEW.vehicle_company_id;

    IF v_company_branch IS NULL THEN
      RAISE EXCEPTION 'Vehicle company % not found', NEW.vehicle_company_id;
    END IF;

    IF v_company_branch IS DISTINCT FROM NEW.branch_id THEN
      RAISE EXCEPTION
        'Vehicle company branch (%) must match tour branch (%)',
        v_company_branch, NEW.branch_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tour_vehicle_company_branch_match ON public.tours;
CREATE TRIGGER trg_enforce_tour_vehicle_company_branch_match
  BEFORE INSERT OR UPDATE ON public.tours
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tour_vehicle_company_branch_match();

-- ────────────────────────────────────────────────────────────────────────────
-- 6. RLS — profile-based vehicle company access
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tours_vehicle_company_select ON public.tours;
CREATE POLICY tours_vehicle_company_select
  ON public.tours
  FOR SELECT
  TO authenticated
  USING (
    vehicle_company_profile_id IS NOT NULL
    AND vehicle_company_profile_id = auth.uid()
  );

DROP POLICY IF EXISTS vehicle_route_reports_vehicle_select ON public.vehicle_route_reports;
CREATE POLICY vehicle_route_reports_vehicle_select
  ON public.vehicle_route_reports
  FOR SELECT
  TO authenticated
  USING (vehicle_company_profile_id = auth.uid());

DROP POLICY IF EXISTS vehicle_route_reports_vehicle_insert ON public.vehicle_route_reports;
CREATE POLICY vehicle_route_reports_vehicle_insert
  ON public.vehicle_route_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    vehicle_company_profile_id = auth.uid()
    AND public.vehicle_company_owns_tour(tour_id)
    AND status = 'draft'
    AND submitted_at IS NULL
    AND submitted_by IS NULL
  );

DROP POLICY IF EXISTS vehicle_route_reports_vehicle_update ON public.vehicle_route_reports;
CREATE POLICY vehicle_route_reports_vehicle_update
  ON public.vehicle_route_reports
  FOR UPDATE
  TO authenticated
  USING (
    vehicle_company_profile_id = auth.uid()
    AND status = 'draft'
  )
  WITH CHECK (
    vehicle_company_profile_id = auth.uid()
  );

DROP POLICY IF EXISTS vehicle_report_checks_vehicle_select ON public.vehicle_report_checks;
CREATE POLICY vehicle_report_checks_vehicle_select
  ON public.vehicle_report_checks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vehicle_route_reports r
      WHERE r.id = vehicle_report_checks.report_id
        AND r.vehicle_company_profile_id = auth.uid()
        AND r.status = 'submitted'
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Recall cleanup RPC — clear profile assignment + delete reports
-- ────────────────────────────────────────────────────────────────────────────
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
  IF NOT public.auth_user_is_admin_tier() THEN
    RAISE EXCEPTION 'Vehicle recall cleanup requires admin tier';
  END IF;

  SELECT * INTO v_tour FROM public.tours WHERE id = p_tour_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tour % not found', p_tour_id;
  END IF;

  IF v_tour.assignment_status IS NULL OR v_tour.assignment_status <> 'recalled' THEN
    RAISE EXCEPTION 'Vehicle recall cleanup requires a recalled tour assignment';
  END IF;

  IF NOT public.auth_user_is_master_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.branch_id = v_tour.branch_id
    ) THEN
      RAISE EXCEPTION 'Vehicle recall cleanup not allowed for this region';
    END IF;
  END IF;

  DELETE FROM public.vehicle_route_reports WHERE tour_id = p_tour_id;
  GET DIAGNOSTICS v_deleted_reports = ROW_COUNT;

  UPDATE public.tours
  SET
    vehicle_company_profile_id = NULL,
    vehicle_company_id = NULL
  WHERE id = p_tour_id;

  RETURN v_deleted_reports;
END;
$$;

REVOKE DELETE ON TABLE public.vehicle_route_reports FROM authenticated;
REVOKE ALL ON FUNCTION public.recall_tour_vehicle_cleanup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recall_tour_vehicle_cleanup(uuid) TO authenticated;

COMMIT;

-- ============================================================================
-- NOTES (NOT executed)
-- ----------------------------------------------------------------------------
-- * vehicle_companies / vehicle_company_users / tours.vehicle_company_id /
--   vehicle_route_reports.vehicle_company_id are DEPRECATED, not dropped.
-- * App code after v2 uses only vehicle_company_profile_id columns.
-- * Orphan tours (company assigned but no linked profile) keep NULL profile_id
--   until admin reassigns manually.
-- ============================================================================
