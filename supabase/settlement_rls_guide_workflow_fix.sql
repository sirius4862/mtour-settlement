-- Guide workflow RLS fix — apply after settlement_rls_hardening_migration.sql
--
-- Root cause: guide snapshot INSERT used INSERT…RETURNING in the app while hardening
-- removed guide SELECT on base settlement_snapshots (intentional for redaction).
-- This migration:
--   1. Strengthens guide snapshot INSERT policy (ownership + created_by)
--   2. Restores guide SELECT on settlement_confirmations (confirm flow reads)
--   3. Does NOT restore broad guide SELECT on settlement_snapshots (redaction preserved)
--
-- Safe to re-run.

BEGIN;

-- Ownership helper — SECURITY DEFINER reads settlements without guide base SELECT
CREATE OR REPLACE FUNCTION public.settlement_guide_owns(p_settlement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.settlements s
    WHERE s.id = p_settlement_id
      AND s.guide_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.settlement_guide_owns(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settlement_guide_owns(uuid) TO authenticated;

-- Guide snapshot INSERT (submit + confirm); no guide base SELECT needed when app uses client id
DROP POLICY IF EXISTS settlement_snapshots_guide_insert ON public.settlement_snapshots;

CREATE POLICY settlement_snapshots_guide_insert
  ON public.settlement_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.settlement_guide_owns(settlement_id)
    AND created_by = auth.uid()
  );

-- Guide confirm flow may read own pending confirmations from base table (admin columns only)
DROP POLICY IF EXISTS settlement_confirmations_guide_select ON public.settlement_confirmations;

CREATE POLICY settlement_confirmations_guide_select
  ON public.settlement_confirmations
  FOR SELECT
  TO authenticated
  USING (
    public.settlement_guide_owns(settlement_id)
    AND public.auth_user_is_guide()
    AND NOT public.auth_user_is_admin_tier()
  );

COMMIT;

-- Verification:
-- SELECT policyname, cmd FROM pg_policies
-- WHERE tablename IN ('settlement_snapshots', 'settlement_confirmations')
-- ORDER BY tablename, policyname;
