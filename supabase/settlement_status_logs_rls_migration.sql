-- =============================================================
-- settlement_status_logs RLS — guide save/submit fix
-- Run in Supabase Dashboard → SQL Editor (local + production)
--
-- Symptom: "new row violates row-level security policy for table
--           settlement_status_logs" on guide draft save / submit.
--
-- Cause: settlements UPDATE trigger inserts status logs as the
--         authenticated user, but no INSERT policy existed.
--
-- Also adds RLS for confirmation workflow audit tables created in
-- settlement_confirmation_migration.sql (preventive).
-- =============================================================

BEGIN;

-- ── Helper: can this user access a settlement? ─────────────────

CREATE OR REPLACE FUNCTION public.auth_user_can_access_settlement(p_settlement_id uuid)
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
  )
  OR EXISTS (
    SELECT 1
    FROM public.settlements s
    WHERE s.id = p_settlement_id
      AND s.guide_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.auth_user_can_access_settlement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_can_access_settlement(uuid) TO authenticated;

-- ── 1. settlement_status_logs ──────────────────────────────────

ALTER TABLE public.settlement_status_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settlement_status_logs_guide_select ON public.settlement_status_logs;
DROP POLICY IF EXISTS settlement_status_logs_guide_insert ON public.settlement_status_logs;
DROP POLICY IF EXISTS settlement_status_logs_admin_all ON public.settlement_status_logs;

-- Guide: read logs for own settlements
CREATE POLICY settlement_status_logs_guide_select
  ON public.settlement_status_logs
  FOR SELECT
  TO authenticated
  USING (public.auth_user_can_access_settlement(settlement_id));

-- Guide: insert logs for own settlements (trigger / server action as auth user)
CREATE POLICY settlement_status_logs_guide_insert
  ON public.settlement_status_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.auth_user_can_access_settlement(settlement_id)
    AND changed_by = auth.uid()
  );

-- Admin/staff: full access
CREATE POLICY settlement_status_logs_admin_all
  ON public.settlement_status_logs
  FOR ALL
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'master_admin')
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'master_admin')
  );

-- ── 2. settlement_audit_events (confirm workflow) ────────────────

ALTER TABLE public.settlement_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settlement_audit_events_guide_select ON public.settlement_audit_events;
DROP POLICY IF EXISTS settlement_audit_events_guide_insert ON public.settlement_audit_events;
DROP POLICY IF EXISTS settlement_audit_events_admin_all ON public.settlement_audit_events;

CREATE POLICY settlement_audit_events_guide_select
  ON public.settlement_audit_events
  FOR SELECT
  TO authenticated
  USING (public.auth_user_can_access_settlement(settlement_id));

CREATE POLICY settlement_audit_events_guide_insert
  ON public.settlement_audit_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.auth_user_can_access_settlement(settlement_id)
    AND actor_id = auth.uid()
  );

CREATE POLICY settlement_audit_events_admin_all
  ON public.settlement_audit_events
  FOR ALL
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'master_admin')
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'master_admin')
  );

-- ── 3. settlement_snapshots ────────────────────────────────────

ALTER TABLE public.settlement_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settlement_snapshots_guide_select ON public.settlement_snapshots;
DROP POLICY IF EXISTS settlement_snapshots_guide_insert ON public.settlement_snapshots;
DROP POLICY IF EXISTS settlement_snapshots_admin_all ON public.settlement_snapshots;

CREATE POLICY settlement_snapshots_guide_select
  ON public.settlement_snapshots
  FOR SELECT
  TO authenticated
  USING (public.auth_user_can_access_settlement(settlement_id));

CREATE POLICY settlement_snapshots_guide_insert
  ON public.settlement_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.auth_user_can_access_settlement(settlement_id)
    AND created_by = auth.uid()
  );

CREATE POLICY settlement_snapshots_admin_all
  ON public.settlement_snapshots
  FOR ALL
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'master_admin')
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'master_admin')
  );

-- ── 4. settlement_confirmations ────────────────────────────────

ALTER TABLE public.settlement_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settlement_confirmations_guide_select ON public.settlement_confirmations;
DROP POLICY IF EXISTS settlement_confirmations_guide_update ON public.settlement_confirmations;
DROP POLICY IF EXISTS settlement_confirmations_admin_all ON public.settlement_confirmations;

CREATE POLICY settlement_confirmations_guide_select
  ON public.settlement_confirmations
  FOR SELECT
  TO authenticated
  USING (public.auth_user_can_access_settlement(settlement_id));

-- Guide confirms: update pending → confirmed
CREATE POLICY settlement_confirmations_guide_update
  ON public.settlement_confirmations
  FOR UPDATE
  TO authenticated
  USING (
    public.auth_user_can_access_settlement(settlement_id)
    AND status = 'pending'
  )
  WITH CHECK (
    public.auth_user_can_access_settlement(settlement_id)
    AND (confirmed_by IS NULL OR confirmed_by = auth.uid())
  );

CREATE POLICY settlement_confirmations_admin_all
  ON public.settlement_confirmations
  FOR ALL
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'master_admin')
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'master_admin')
  );

-- ── 5. settlement_field_changes ────────────────────────────────

ALTER TABLE public.settlement_field_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settlement_field_changes_guide_select ON public.settlement_field_changes;
DROP POLICY IF EXISTS settlement_field_changes_admin_insert ON public.settlement_field_changes;
DROP POLICY IF EXISTS settlement_field_changes_admin_all ON public.settlement_field_changes;

CREATE POLICY settlement_field_changes_guide_select
  ON public.settlement_field_changes
  FOR SELECT
  TO authenticated
  USING (public.auth_user_can_access_settlement(settlement_id));

CREATE POLICY settlement_field_changes_admin_insert
  ON public.settlement_field_changes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'master_admin')
    AND public.auth_user_can_access_settlement(settlement_id)
  );

CREATE POLICY settlement_field_changes_admin_all
  ON public.settlement_field_changes
  FOR ALL
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'master_admin')
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'master_admin')
  );

COMMIT;

-- ── Verification ───────────────────────────────────────────────
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename IN (
--   'settlement_status_logs',
--   'settlement_audit_events',
--   'settlement_snapshots'
-- )
-- ORDER BY tablename, policyname;

-- After applying: guide draft save + submit should succeed.
-- If INSERT still fails, check DB trigger sets changed_by = auth.uid():
--   SELECT pg_get_triggerdef(oid) FROM pg_trigger
--   WHERE tgrelid = 'public.settlements'::regclass AND NOT tgisinternal;
