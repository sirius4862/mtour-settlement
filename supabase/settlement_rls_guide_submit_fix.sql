-- Guide submit RLS fix — apply after:
--   settlement_rls_hardening_migration.sql
--   settlement_rls_guide_workflow_fix.sql
--   settlement_rls_line_items_guide_write_fix.sql
--   settlement_status_logs_rls_migration.sql (status log trigger + policies)
--
-- Symptom: guide submit appears to succeed in UI (no error) but status stays draft.
-- Cause: settlements UPDATE affects 0 rows when RLS USING/WITH CHECK or optimistic
--         status filter fails; PostgREST returns no error. Status-change trigger
--         may also require settlement_status_logs INSERT as auth user.
--
-- Safe to re-run.

BEGIN;

-- Workflow helper — SECURITY DEFINER ownership + editable / confirm statuses on OLD row
CREATE OR REPLACE FUNCTION public.settlement_allows_guide_workflow_mutation(p_settlement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.settlement_guide_owns(p_settlement_id)
  AND EXISTS (
    SELECT 1
    FROM public.settlements s
    WHERE s.id = p_settlement_id
      AND s.status IN (
        'draft', 'rejected', 'edit_requested', 'pending_guide_confirmation'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.settlement_allows_guide_workflow_mutation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settlement_allows_guide_workflow_mutation(uuid) TO authenticated;

-- Guide may UPDATE own settlement for save/submit/confirm/clarify (not paid)
DROP POLICY IF EXISTS settlements_guide_update ON public.settlements;

CREATE POLICY settlements_guide_update
  ON public.settlements
  FOR UPDATE
  TO authenticated
  USING (
    public.auth_user_is_guide()
    AND NOT public.auth_user_is_admin_tier()
    AND guide_id = auth.uid()
    AND public.settlement_allows_guide_workflow_mutation(id)
  )
  WITH CHECK (
    public.auth_user_is_guide()
    AND NOT public.auth_user_is_admin_tier()
    AND guide_id = auth.uid()
    AND status <> 'paid'
    AND status IN (
      'draft', 'rejected', 'edit_requested',
      'submitted',
      'pending_guide_confirmation', 'clarification_requested', 'approved'
    )
  );

-- Status log INSERT (settlements UPDATE trigger runs as authenticated guide)
DROP POLICY IF EXISTS settlement_status_logs_guide_insert ON public.settlement_status_logs;

CREATE POLICY settlement_status_logs_guide_insert
  ON public.settlement_status_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.auth_user_is_guide()
    AND NOT public.auth_user_is_admin_tier()
    AND public.settlement_guide_owns(settlement_id)
    AND changed_by = auth.uid()
  );

-- Audit trail on submit
DROP POLICY IF EXISTS settlement_audit_events_guide_insert ON public.settlement_audit_events;

CREATE POLICY settlement_audit_events_guide_insert
  ON public.settlement_audit_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.auth_user_is_guide()
    AND NOT public.auth_user_is_admin_tier()
    AND public.settlement_guide_owns(settlement_id)
    AND actor_id = auth.uid()
  );

-- Snapshot insert on submit (no guide base SELECT — app uses client id, no RETURNING)
DROP POLICY IF EXISTS settlement_snapshots_guide_insert ON public.settlement_snapshots;

CREATE POLICY settlement_snapshots_guide_insert
  ON public.settlement_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.auth_user_is_guide()
    AND NOT public.auth_user_is_admin_tier()
    AND public.settlement_guide_owns(settlement_id)
    AND created_by = auth.uid()
  );

COMMIT;

-- Verification:
-- SELECT policyname, cmd FROM pg_policies
-- WHERE tablename = 'settlements' AND policyname LIKE '%guide%';
-- SELECT policyname FROM pg_policies
-- WHERE tablename IN ('settlement_status_logs','settlement_audit_events','settlement_snapshots')
--   AND policyname LIKE '%guide_insert%';
