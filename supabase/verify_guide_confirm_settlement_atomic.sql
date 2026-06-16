-- ============================================================================
-- Guide confirm atomic RPC — READ-ONLY schema spot-checks
-- Run in Supabase SQL Editor AFTER settlement_workflow_v1_guide_confirm_atomic_rpc.sql
-- ============================================================================

-- ── 1. Function exists and is SECURITY DEFINER ───────────────────────────────
SELECT pg_get_functiondef('public.guide_confirm_settlement(uuid,timestamp with time zone)'::regprocedure) AS fn_def;
-- PASS: fn_def contains:
--   SECURITY DEFINER
--   auth_user_is_guide()
--   auth_user_is_admin_tier()
--   guide_id IS DISTINCT FROM auth.uid()  (or equivalent ownership check)
--   active_confirmation_id
--   confirmation packet is not pending  (or status <> pending guard)
--   UPDATE public.settlement_confirmations
--   status = 'confirmed'
--   settlement confirm update affected
--   confirmation packet update affected


-- ── 2. Grants — authenticated only ───────────────────────────────────────────
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'guide_confirm_settlement'
ORDER BY grantee, privilege_type;
-- PASS: authenticated has EXECUTE; no broad PUBLIC grant required beyond revoke pattern.
