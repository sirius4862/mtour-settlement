-- settlements RLS — admin action queue + admin list fix
-- Run in Supabase Dashboard → SQL Editor (local + production)
--
-- Symptom: admin dashboard "처리 필요 정산서" empty while submitted rows exist in DB.
-- Cause: settlements RLS missing admin/master_admin SELECT (or legacy admin/staff-only policies).
--
-- Safe to re-run: no data changes, no settlement calc/workflow changes.
-- Does NOT modify line-item or audit table policies.

BEGIN;

CREATE OR REPLACE FUNCTION public.auth_user_is_admin_tier()
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
      AND p.role IN ('admin', 'master_admin')
  );
$$;

REVOKE ALL ON FUNCTION public.auth_user_is_admin_tier() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_is_admin_tier() TO authenticated;

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'settlements'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.settlements', pol.policyname);
  END LOOP;
END $$;

-- admin + master_admin: read and update all settlements
CREATE POLICY settlements_admin_all
  ON public.settlements
  FOR ALL
  TO authenticated
  USING (public.auth_user_is_admin_tier())
  WITH CHECK (public.auth_user_is_admin_tier());

-- guide: read own settlements
CREATE POLICY settlements_guide_select
  ON public.settlements
  FOR SELECT
  TO authenticated
  USING (guide_id = auth.uid());

-- guide: create own settlements
CREATE POLICY settlements_guide_insert
  ON public.settlements
  FOR INSERT
  TO authenticated
  WITH CHECK (guide_id = auth.uid());

-- guide: update own settlements (status guards enforced in app)
CREATE POLICY settlements_guide_update
  ON public.settlements
  FOR UPDATE
  TO authenticated
  USING (guide_id = auth.uid())
  WITH CHECK (guide_id = auth.uid());

COMMIT;

-- Verification (SQL Editor / bypasses RLS unless run as authenticated):
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies WHERE tablename = 'settlements' ORDER BY policyname;
--
-- SELECT status, COUNT(*) FROM public.settlements
-- WHERE status IN ('submitted', 'pending_guide_confirmation', 'clarification_requested')
-- GROUP BY status;
