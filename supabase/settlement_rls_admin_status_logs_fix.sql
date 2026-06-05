-- Admin / shared status-log fix — apply BEFORE guide submit transition fix.
--
-- Failure B symptom:
--   Admin 「가이드 검토 요청」 → settlements UPDATE succeeds, then
--   "new row violates row-level security policy for table settlement_status_logs"
--
-- Root cause:
--   settlements status-change trigger INSERTs settlement_status_logs as the
--   authenticated user. Production often has guide_insert policy (from
--   guide_submit_fix) but is missing or ineffective admin INSERT policy.
--   Legacy triggers may also set changed_by ≠ auth.uid().
--
-- Fix:
--   1. SECURITY DEFINER status-log trigger (bypasses RLS; sets changed_by = auth.uid()).
--   2. Explicit admin/master INSERT + ALL policies via auth_user_is_admin_tier().
--   3. Guide INSERT policy (non-admin guides only).
--
-- Safe to re-run.

BEGIN;

-- ── 1. SECURITY DEFINER status logger (all roles, all status transitions) ───

CREATE OR REPLACE FUNCTION public.trg_log_settlement_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.settlement_status_logs (
      settlement_id,
      changed_by,
      from_status,
      to_status
    ) VALUES (
      NEW.id,
      COALESCE(auth.uid(), NEW.guide_id),
      OLD.status,
      NEW.status
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_log_settlement_status_change() FROM PUBLIC;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'public.settlements'::regclass
      AND NOT tgisinternal
      AND pg_get_triggerdef(oid) ILIKE '%settlement_status_logs%'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.settlements', r.tgname);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_log_settlement_status_change ON public.settlements;
CREATE TRIGGER trg_log_settlement_status_change
  AFTER UPDATE OF status ON public.settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_log_settlement_status_change();

-- ── 2. settlement_status_logs policies — guide, admin, master_admin ─────────

ALTER TABLE public.settlement_status_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settlement_status_logs_guide_select ON public.settlement_status_logs;
DROP POLICY IF EXISTS settlement_status_logs_guide_insert ON public.settlement_status_logs;
DROP POLICY IF EXISTS settlement_status_logs_admin_all ON public.settlement_status_logs;
DROP POLICY IF EXISTS settlement_status_logs_admin_insert ON public.settlement_status_logs;

CREATE POLICY settlement_status_logs_guide_select
  ON public.settlement_status_logs
  FOR SELECT
  TO authenticated
  USING (public.auth_user_can_access_settlement(settlement_id));

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

-- Plain admin + master_admin: full access (SELECT/INSERT/UPDATE/DELETE)
CREATE POLICY settlement_status_logs_admin_all
  ON public.settlement_status_logs
  FOR ALL
  TO authenticated
  USING (public.auth_user_is_admin_tier())
  WITH CHECK (public.auth_user_is_admin_tier());

-- Explicit INSERT for admin tier (covers trigger-as-invoker if SECURITY DEFINER ever removed)
CREATE POLICY settlement_status_logs_admin_insert
  ON public.settlement_status_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.auth_user_is_admin_tier()
    AND public.auth_user_can_access_settlement(settlement_id)
    AND changed_by = auth.uid()
  );

COMMIT;

-- Verification:
-- SELECT policyname, cmd FROM pg_policies
-- WHERE tablename = 'settlement_status_logs' ORDER BY policyname;
-- SELECT tgname FROM pg_trigger
-- WHERE tgrelid = 'public.settlements'::regclass AND NOT tgisinternal;
