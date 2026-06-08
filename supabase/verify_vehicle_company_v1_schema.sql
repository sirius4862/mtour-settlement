-- ============================================================================
-- VEHICLE COMPANY REPORT v1 — SCHEMA VERIFICATION (read-only, single table)
-- Run in Supabase SQL Editor AFTER STEP 1 + STEP 2 have committed.
-- Returns ONE result set (check_name, details, ok). Every row should be ok=true.
-- This script makes NO writes and touches NO settlement/payout/status logic.
-- ============================================================================

SELECT check_name, details, ok
FROM (

  -- Check 1: enum value 'vehicle_company' exists on public.user_role
  SELECT 1 AS ord,
    'check_1_enum_vehicle_company' AS check_name,
    'public.user_role includes vehicle_company' AS details,
    EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'user_role' AND e.enumlabel = 'vehicle_company'
    ) AS ok

  UNION ALL
  -- Check 2: tours.vehicle_company_id column exists
  SELECT 2,
    'check_2_tours_vehicle_company_id_column',
    'tours.vehicle_company_id column present',
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tours'
        AND column_name = 'vehicle_company_id'
    )

  UNION ALL
  -- Check 2b: tours.vehicle_company_id FK exists
  SELECT 3,
    'check_2b_tours_vehicle_company_id_fk',
    'FK tours_vehicle_company_id_fkey present',
    EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'tours_vehicle_company_id_fkey'
    )

  UNION ALL
  -- Check 3: all four tables exist (expect 4)
  SELECT 4,
    'check_3_tables_exist',
    'found ' || COUNT(*)::text || ' of 4 tables',
    COUNT(*) = 4
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'vehicle_companies', 'vehicle_company_users',
      'vehicle_route_reports', 'vehicle_report_checks'
    )

  UNION ALL
  -- Check 4: UNIQUE (tour_id) on vehicle_route_reports (Decision #6)
  SELECT 5,
    'check_4_unique_tour_id',
    'UNIQUE(tour_id) on vehicle_route_reports',
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'vehicle_route_reports_tour_id_key' AND contype = 'u'
    )

  UNION ALL
  -- Check 5: UNIQUE (report_id, guide_id) on vehicle_report_checks
  SELECT 6,
    'check_5_unique_report_guide',
    'UNIQUE(report_id, guide_id) on vehicle_report_checks',
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'vehicle_report_checks_report_guide_key' AND contype = 'u'
    )

  UNION ALL
  -- Check 6: report status CHECK constraint exists
  SELECT 7,
    'check_6_report_status_check',
    'vehicle_route_reports_status_check present',
    EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_route_reports_status_check'
    )

  UNION ALL
  -- Check 6b: check status CHECK constraint exists
  SELECT 8,
    'check_6b_check_status_check',
    'vehicle_report_checks_status_check present',
    EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_report_checks_status_check'
    )

  UNION ALL
  -- Check 7: RLS enabled on all four tables (expect 4)
  SELECT 9,
    'check_7_rls_enabled',
    'RLS enabled on ' || COUNT(*)::text || ' of 4 tables',
    COUNT(*) = 4
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relrowsecurity = true
    AND c.relname IN (
      'vehicle_companies', 'vehicle_company_users',
      'vehicle_route_reports', 'vehicle_report_checks'
    )

  UNION ALL
  -- Check 8: helper functions exist (expect 3)
  SELECT 10,
    'check_8_helper_functions',
    'found ' || COUNT(*)::text || ' of 3 helper functions',
    COUNT(*) = 3
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'auth_user_is_vehicle_company',
      'auth_user_vehicle_company_id',
      'vehicle_company_owns_tour'
    )

  UNION ALL
  -- Check 9: branch-match trigger exists on public.tours
  SELECT 11,
    'check_9_branch_match_trigger',
    'trg_enforce_tour_vehicle_company_branch_match on tours',
    EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_enforce_tour_vehicle_company_branch_match'
        AND tgrelid = 'public.tours'::regclass
    )

  UNION ALL
  -- Check 9b: submitted-lock trigger exists on vehicle_route_reports
  SELECT 12,
    'check_9b_submitted_lock_trigger',
    'trg_enforce_vehicle_report_submitted_lock on vehicle_route_reports',
    EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_enforce_vehicle_report_submitted_lock'
        AND tgrelid = 'public.vehicle_route_reports'::regclass
    )

  UNION ALL
  -- Check 10: vehicle_route_reports policies (expect 5)
  SELECT 13,
    'check_10_report_policies',
    'found ' || COUNT(*)::text || ' of 5 report policies',
    COUNT(*) = 5
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'vehicle_route_reports'
    AND policyname IN (
      'vehicle_route_reports_admin_select',
      'vehicle_route_reports_vehicle_select',
      'vehicle_route_reports_vehicle_insert',
      'vehicle_route_reports_vehicle_update',
      'vehicle_route_reports_guide_select'
    )

  UNION ALL
  -- Check 10b: vehicle_report_checks policies (expect 4, insert-once)
  SELECT 14,
    'check_10b_check_policies',
    'found ' || COUNT(*)::text || ' of 4 check policies',
    COUNT(*) = 4
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'vehicle_report_checks'
    AND policyname IN (
      'vehicle_report_checks_admin_select',
      'vehicle_report_checks_vehicle_select',
      'vehicle_report_checks_guide_select',
      'vehicle_report_checks_guide_insert'
    )

  UNION ALL
  -- Check 10c: no UPDATE/DELETE policy on vehicle_report_checks (insert-once)
  SELECT 15,
    'check_10c_checks_no_update_delete_policy',
    'no UPDATE/DELETE policy on vehicle_report_checks',
    NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'vehicle_report_checks'
        AND cmd IN ('UPDATE', 'DELETE')
    )

  UNION ALL
  -- Check 10d: authenticated has no UPDATE/DELETE grant on vehicle_report_checks
  SELECT 16,
    'check_10d_checks_no_update_delete_grant',
    'authenticated lacks UPDATE/DELETE on vehicle_report_checks',
    NOT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = 'vehicle_report_checks'
        AND grantee = 'authenticated'
        AND privilege_type IN ('UPDATE', 'DELETE')
    )

  UNION ALL
  -- Check 11: guide report SELECT restricted to submitted + own tour (Decision #9)
  SELECT 17,
    'check_11_guide_select_submitted_only',
    'guide report SELECT requires submitted + guide_id',
    COALESCE((
      SELECT (qual ILIKE '%submitted%' AND qual ILIKE '%guide_id%')
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'vehicle_route_reports'
        AND policyname = 'vehicle_route_reports_guide_select'
    ), false)

  UNION ALL
  -- Check 12: existing tours_select policy preserved (untouched)
  SELECT 18,
    'check_12_tours_select_preserved',
    'existing tours_select policy still present',
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'tours'
        AND policyname = 'tours_select'
    )

  UNION ALL
  -- Check 13: additive vehicle-company tours SELECT policy added
  SELECT 19,
    'check_13_tours_vehicle_company_select',
    'tours_vehicle_company_select policy present',
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'tours'
        AND policyname = 'tours_vehicle_company_select'
    )

  UNION ALL
  -- Check 14: settlements UNCHANGED — no vehicle-report columns added
  SELECT 20,
    'check_14_settlements_untouched',
    'no vehicle-report columns on settlements',
    NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'settlements'
        AND column_name IN (
          'vehicle_company_id', 'vehicle_report_check_status',
          'vehicle_report_issue_note', 'vehicle_report_checked_at',
          'vehicle_report_checked_by'
        )
    )

  UNION ALL
  -- Check 15 (v1.2): recall cleanup RPC exists and is SECURITY DEFINER
  SELECT 21,
    'check_15_recall_cleanup_rpc_security_definer',
    'recall_tour_vehicle_cleanup(uuid) exists + SECURITY DEFINER',
    COALESCE((
      SELECT p.prosecdef
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'recall_tour_vehicle_cleanup'
      LIMIT 1
    ), false)

  UNION ALL
  -- Check 16 (v1.2): EXECUTE on the RPC granted to authenticated
  SELECT 22,
    'check_16_recall_cleanup_rpc_execute_grant',
    'authenticated may EXECUTE recall_tour_vehicle_cleanup',
    EXISTS (
      SELECT 1 FROM information_schema.role_routine_grants
      WHERE routine_schema = 'public'
        AND routine_name = 'recall_tour_vehicle_cleanup'
        AND grantee = 'authenticated'
        AND privilege_type = 'EXECUTE'
    )

  UNION ALL
  -- Check 17 (v1.2): NO standing DELETE grant on vehicle_route_reports for authenticated
  SELECT 23,
    'check_17_reports_no_standing_delete_grant',
    'authenticated lacks DELETE on vehicle_route_reports',
    NOT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = 'vehicle_route_reports'
        AND grantee = 'authenticated'
        AND privilege_type = 'DELETE'
    )

  UNION ALL
  -- Check 18 (v1.2): checks.report_id FK cascades from vehicle_route_reports
  SELECT 24,
    'check_18_checks_cascade_from_reports',
    'vehicle_report_checks.report_id FK ON DELETE CASCADE',
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.vehicle_report_checks'::regclass
        AND confrelid = 'public.vehicle_route_reports'::regclass
        AND confdeltype = 'c'
    )

) AS checks
ORDER BY ord;
