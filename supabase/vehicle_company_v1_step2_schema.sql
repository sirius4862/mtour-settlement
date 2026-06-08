-- ============================================================================
-- VEHICLE COMPANY REPORT v1 — STEP 2 (schema + RLS + triggers)
-- Run in Supabase Dashboard → SQL Editor on PRODUCTION, ONLY AFTER STEP 1
-- (vehicle_company_v1_step1_enum.sql) has committed successfully.
--
-- This migration is a SEPARATE OPERATIONS MODULE. It does NOT touch:
--   * settlement submit RPC
--   * settlement status flow / paid-lock
--   * settlement calculation / payout / company profit / guide payout formulas
--   * guide final confirmation flow
--   * settlements table columns (no vehicle-report fields added to settlements)
--
-- What it creates:
--   1. tours.vehicle_company_id (nullable) + FK + branch-match guard trigger
--   2. public.vehicle_companies
--   3. public.vehicle_company_users   (profile ↔ company link, one company/user)
--   4. public.vehicle_route_reports   (one report per tour, submit-locks)
--   5. public.vehicle_report_checks   (guide check: no_issue / issue_reported)
--   6. RLS helper functions + policies for guide / vehicle_company / admin tiers
--   7. submitted-report lock trigger
--
-- Locked decisions baked in:
--   #4  vehicle company can read guide check results for its OWN submitted reports
--   #6  one report per tour            → UNIQUE (tour_id) on vehicle_route_reports
--   #7  company.branch_id must equal tour.branch_id on assignment (DB-enforced)
--   #9  guides only see SUBMITTED reports (draft reports invisible to guides)
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. vehicle_companies
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  branch_id   uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_companies_branch_id
  ON public.vehicle_companies (branch_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. vehicle_company_users  (one vehicle-company per user in v1 → PK on profile)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_company_users (
  profile_id          uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  vehicle_company_id  uuid NOT NULL REFERENCES public.vehicle_companies(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_company_users_company_id
  ON public.vehicle_company_users (vehicle_company_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. tours.vehicle_company_id  (nullable assignment, additive)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tours
  ADD COLUMN IF NOT EXISTS vehicle_company_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tours_vehicle_company_id_fkey'
  ) THEN
    ALTER TABLE public.tours
      ADD CONSTRAINT tours_vehicle_company_id_fkey
      FOREIGN KEY (vehicle_company_id)
      REFERENCES public.vehicle_companies(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tours_vehicle_company_id
  ON public.tours (vehicle_company_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. vehicle_route_reports  (operational only; one per tour; submit-locks)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_route_reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id             uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  vehicle_company_id  uuid NOT NULL REFERENCES public.vehicle_companies(id) ON DELETE CASCADE,
  event_code          text,
  event_period_text   text,
  pax_text            text,
  flight_info_text    text,
  vehicle_text        text,
  hotel_text          text,
  guide_text          text,
  daily_routes        jsonb NOT NULL DEFAULT '[]'::jsonb,
  special_notes       text,
  status              text NOT NULL DEFAULT 'draft',
  submitted_at        timestamptz,
  submitted_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_route_reports_status_check
    CHECK (status IN ('draft', 'submitted')),
  CONSTRAINT vehicle_route_reports_daily_routes_is_array
    CHECK (jsonb_typeof(daily_routes) = 'array'),
  -- Decision #6: one tour = one vehicle route report
  CONSTRAINT vehicle_route_reports_tour_id_key UNIQUE (tour_id)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_route_reports_company_id
  ON public.vehicle_route_reports (vehicle_company_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. vehicle_report_checks  (guide check; one row per guide per report)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_report_checks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     uuid NOT NULL REFERENCES public.vehicle_route_reports(id) ON DELETE CASCADE,
  tour_id       uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  guide_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  check_status  text NOT NULL,
  issue_note    text,
  checked_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_report_checks_status_check
    CHECK (check_status IN ('no_issue', 'issue_reported')),
  CONSTRAINT vehicle_report_checks_report_guide_key UNIQUE (report_id, guide_id)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_report_checks_tour_id
  ON public.vehicle_report_checks (tour_id);

-- ============================================================================
-- HELPER FUNCTIONS (SECURITY DEFINER, mirror existing auth_user_* pattern)
-- ============================================================================

-- Is the current user a vehicle_company-role user?
CREATE OR REPLACE FUNCTION public.auth_user_is_vehicle_company()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'vehicle_company'::public.user_role
  );
$$;

-- Which vehicle company does the current user belong to? (NULL if none)
CREATE OR REPLACE FUNCTION public.auth_user_vehicle_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vcu.vehicle_company_id
  FROM public.vehicle_company_users vcu
  WHERE vcu.profile_id = auth.uid()
  LIMIT 1;
$$;

-- Is the given tour assigned to the current user's vehicle company?
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
      AND t.vehicle_company_id IS NOT NULL
      AND t.vehicle_company_id = public.auth_user_vehicle_company_id()
  );
$$;

REVOKE ALL ON FUNCTION public.auth_user_is_vehicle_company() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_is_vehicle_company() TO authenticated;

REVOKE ALL ON FUNCTION public.auth_user_vehicle_company_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_vehicle_company_id() TO authenticated;

REVOKE ALL ON FUNCTION public.vehicle_company_owns_tour(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vehicle_company_owns_tour(uuid) TO authenticated;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Decision #7: a vehicle company may only be assigned to a tour in the SAME
-- branch. Enforced at the DB layer so direct writes cannot bypass it. Only runs
-- when vehicle_company_id is being set / changed, so unrelated tour updates are
-- unaffected.
CREATE OR REPLACE FUNCTION public.enforce_tour_vehicle_company_branch_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_branch uuid;
BEGIN
  IF NEW.vehicle_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.vehicle_company_id IS NOT DISTINCT FROM OLD.vehicle_company_id THEN
    RETURN NEW;  -- assignment unchanged; skip
  END IF;

  SELECT vc.branch_id
    INTO v_company_branch
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tour_vehicle_company_branch_match ON public.tours;
CREATE TRIGGER trg_enforce_tour_vehicle_company_branch_match
  BEFORE INSERT OR UPDATE ON public.tours
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tour_vehicle_company_branch_match();

-- Submitted vehicle reports are immutable (Decision: submit once, then locked).
-- Blocks ANY UPDATE to a row whose existing status is already 'submitted'
-- (also prevents reverting submitted → draft). The single draft → submitted
-- transition is allowed because OLD.status is still 'draft' at that point.
CREATE OR REPLACE FUNCTION public.enforce_vehicle_report_submitted_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'submitted' THEN
    RAISE EXCEPTION 'Submitted vehicle report is locked and cannot be modified';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_vehicle_report_submitted_lock ON public.vehicle_route_reports;
CREATE TRIGGER trg_enforce_vehicle_report_submitted_lock
  BEFORE UPDATE ON public.vehicle_route_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_vehicle_report_submitted_lock();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.vehicle_companies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_company_users  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_route_reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_report_checks  ENABLE ROW LEVEL SECURITY;

-- Base table grants (RLS policies below do the real gating). No DELETE in v1.
-- vehicle_report_checks is INSERT-ONCE for guides: UPDATE is intentionally NOT
-- granted (and no UPDATE policy exists), so a guide check cannot be amended or
-- deleted once written. There is no correction loop in v1.
GRANT SELECT, INSERT, UPDATE ON public.vehicle_companies      TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vehicle_company_users  TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vehicle_route_reports  TO authenticated;
GRANT SELECT, INSERT         ON public.vehicle_report_checks  TO authenticated;

-- Idempotent hardening: GRANT SELECT, INSERT does NOT remove an UPDATE/DELETE
-- privilege that may have been granted on an earlier run (before the insert-once
-- correction). Explicitly revoke them so every re-run leaves vehicle_report_checks
-- as INSERT-ONCE for guides.
REVOKE UPDATE, DELETE ON TABLE public.vehicle_report_checks FROM authenticated;

-- ── vehicle_companies ───────────────────────────────────────────────────────
-- Admin tier: full management (branch/region scoping enforced in app layer).
DROP POLICY IF EXISTS vehicle_companies_admin_all ON public.vehicle_companies;
CREATE POLICY vehicle_companies_admin_all
  ON public.vehicle_companies
  FOR ALL
  TO authenticated
  USING (public.auth_user_is_admin_tier())
  WITH CHECK (public.auth_user_is_admin_tier());

-- Vehicle company user: read only their own company record.
DROP POLICY IF EXISTS vehicle_companies_vehicle_select ON public.vehicle_companies;
CREATE POLICY vehicle_companies_vehicle_select
  ON public.vehicle_companies
  FOR SELECT
  TO authenticated
  USING (id = public.auth_user_vehicle_company_id());

-- ── vehicle_company_users ───────────────────────────────────────────────────
-- Admin tier: full management of the profile ↔ company links.
DROP POLICY IF EXISTS vehicle_company_users_admin_all ON public.vehicle_company_users;
CREATE POLICY vehicle_company_users_admin_all
  ON public.vehicle_company_users
  FOR ALL
  TO authenticated
  USING (public.auth_user_is_admin_tier())
  WITH CHECK (public.auth_user_is_admin_tier());

-- Vehicle company user: read only their own link row.
DROP POLICY IF EXISTS vehicle_company_users_self_select ON public.vehicle_company_users;
CREATE POLICY vehicle_company_users_self_select
  ON public.vehicle_company_users
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- ── tours: additive SELECT policy for vehicle company ───────────────────────
-- Vehicle company users can read ONLY tours assigned to their company. This is
-- an additional permissive SELECT policy; existing tours_select is untouched.
DROP POLICY IF EXISTS tours_vehicle_company_select ON public.tours;
CREATE POLICY tours_vehicle_company_select
  ON public.tours
  FOR SELECT
  TO authenticated
  USING (
    vehicle_company_id IS NOT NULL
    AND vehicle_company_id = public.auth_user_vehicle_company_id()
  );

-- ── vehicle_route_reports ───────────────────────────────────────────────────
-- Admin tier: read all reports (branch/region scoping enforced in app layer).
DROP POLICY IF EXISTS vehicle_route_reports_admin_select ON public.vehicle_route_reports;
CREATE POLICY vehicle_route_reports_admin_select
  ON public.vehicle_route_reports
  FOR SELECT
  TO authenticated
  USING (public.auth_user_is_admin_tier());

-- Vehicle company: read its own reports (draft + submitted).
DROP POLICY IF EXISTS vehicle_route_reports_vehicle_select ON public.vehicle_route_reports;
CREATE POLICY vehicle_route_reports_vehicle_select
  ON public.vehicle_route_reports
  FOR SELECT
  TO authenticated
  USING (vehicle_company_id = public.auth_user_vehicle_company_id());

-- Vehicle company: create a DRAFT report for a tour assigned to its company.
DROP POLICY IF EXISTS vehicle_route_reports_vehicle_insert ON public.vehicle_route_reports;
CREATE POLICY vehicle_route_reports_vehicle_insert
  ON public.vehicle_route_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    vehicle_company_id = public.auth_user_vehicle_company_id()
    AND public.vehicle_company_owns_tour(tour_id)
    AND status = 'draft'
    AND submitted_at IS NULL
    AND submitted_by IS NULL
  );

-- Vehicle company: update its own report ONLY while it is still a draft.
-- (The draft → submitted transition passes USING because OLD.status='draft';
--  the submitted-lock trigger blocks any subsequent edit.)
DROP POLICY IF EXISTS vehicle_route_reports_vehicle_update ON public.vehicle_route_reports;
CREATE POLICY vehicle_route_reports_vehicle_update
  ON public.vehicle_route_reports
  FOR UPDATE
  TO authenticated
  USING (
    vehicle_company_id = public.auth_user_vehicle_company_id()
    AND status = 'draft'
  )
  WITH CHECK (
    vehicle_company_id = public.auth_user_vehicle_company_id()
  );

-- Decision #9: guides see ONLY submitted reports for their own assigned tours.
DROP POLICY IF EXISTS vehicle_route_reports_guide_select ON public.vehicle_route_reports;
CREATE POLICY vehicle_route_reports_guide_select
  ON public.vehicle_route_reports
  FOR SELECT
  TO authenticated
  USING (
    status = 'submitted'
    AND EXISTS (
      SELECT 1
      FROM public.tours t
      WHERE t.id = vehicle_route_reports.tour_id
        AND t.guide_id = auth.uid()
    )
  );

-- ── vehicle_report_checks ───────────────────────────────────────────────────
-- Admin tier: read all guide checks.
DROP POLICY IF EXISTS vehicle_report_checks_admin_select ON public.vehicle_report_checks;
CREATE POLICY vehicle_report_checks_admin_select
  ON public.vehicle_report_checks
  FOR SELECT
  TO authenticated
  USING (public.auth_user_is_admin_tier());

-- Decision #4: vehicle company can read guide checks for its OWN submitted
-- reports (operational result only; no settlement/financial data is exposed).
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
        AND r.vehicle_company_id = public.auth_user_vehicle_company_id()
        AND r.status = 'submitted'
    )
  );

-- Guide: read their own check rows.
DROP POLICY IF EXISTS vehicle_report_checks_guide_select ON public.vehicle_report_checks;
CREATE POLICY vehicle_report_checks_guide_select
  ON public.vehicle_report_checks
  FOR SELECT
  TO authenticated
  USING (guide_id = auth.uid());

-- Guide: create a check ONLY for a SUBMITTED report on a tour they are assigned
-- to, with matching tour_id, as themselves.
DROP POLICY IF EXISTS vehicle_report_checks_guide_insert ON public.vehicle_report_checks;
CREATE POLICY vehicle_report_checks_guide_insert
  ON public.vehicle_report_checks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    guide_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.vehicle_route_reports r
      JOIN public.tours t ON t.id = r.tour_id
      WHERE r.id = vehicle_report_checks.report_id
        AND r.status = 'submitted'
        AND r.tour_id = vehicle_report_checks.tour_id
        AND t.guide_id = auth.uid()
    )
  );

-- Guide check is INSERT-ONCE in v1: there is intentionally NO UPDATE or DELETE
-- policy on vehicle_report_checks. Combined with the UPDATE grant being withheld
-- above, a guide cannot amend or delete their check after it is written. If a
-- guide made a mistake, admin / vehicle company handle it operationally outside
-- the guide flow. UNIQUE(report_id, guide_id) prevents a second insert.
-- Defensively drop a legacy update policy name if it was ever created.
DROP POLICY IF EXISTS vehicle_report_checks_guide_update ON public.vehicle_report_checks;

COMMIT;

-- ============================================================================
-- NOTES (NOT executed)
-- ----------------------------------------------------------------------------
-- * No DELETE policies/grants in v1 (no destructive client-side deletes).
-- * Admin branch/region scoping for assignment and listing is enforced in the
--   app layer (same pattern as existing admin settlement/tour scoping); the DB
--   guarantees company.branch_id = tour.branch_id at assignment via trigger.
-- * Guide list-level status is derived in the UI (not stored):
--     submitted report + no check row  → "가이드 미확인"
--     check row exists                 → "가이드 확인"
--   Detail-only: 이상없음 / 이상있음 / issue_note.
-- * No settlements columns, RPC, status, payout, or paid-lock logic touched.
-- ============================================================================
