-- ============================================================================
-- VEHICLE COMPANY REPORT v2 — PROFILE ASSIGNMENT VERIFICATION (read-only)
-- Run AFTER vehicle_company_v2_profile_assignment.sql has committed.
-- Returns ONE result set (check_name, details, ok). Every row should be ok=true.
-- Touches NO settlement tables/RPCs.
-- ============================================================================

SELECT check_name, details, ok
FROM (

  -- v2 columns on tours
  SELECT 1 AS ord,
    'check_v2_tours_profile_column' AS check_name,
    'tours.vehicle_company_profile_id column present' AS details,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tours'
        AND column_name = 'vehicle_company_profile_id'
    ) AS ok

  UNION ALL
  SELECT 2,
    'check_v2_tours_profile_fk',
    'FK tours_vehicle_company_profile_id_fkey present',
    EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'tours_vehicle_company_profile_id_fkey'
    )

  UNION ALL
  SELECT 3,
    'check_v2_tours_profile_index',
    'idx_tours_vehicle_company_profile_id present',
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'tours'
        AND indexname = 'idx_tours_vehicle_company_profile_id'
    )

  UNION ALL
  -- v2 columns on vehicle_route_reports
  SELECT 4,
    'check_v2_reports_profile_column',
    'vehicle_route_reports.vehicle_company_profile_id column present',
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'vehicle_route_reports'
        AND column_name = 'vehicle_company_profile_id'
    )

  UNION ALL
  SELECT 5,
    'check_v2_reports_profile_fk',
    'FK vehicle_route_reports_vehicle_company_profile_id_fkey present',
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'vehicle_route_reports_vehicle_company_profile_id_fkey'
    )

  UNION ALL
  SELECT 6,
    'check_v2_reports_profile_index',
    'idx_vehicle_route_reports_vehicle_company_profile_id present',
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'vehicle_route_reports'
        AND indexname = 'idx_vehicle_route_reports_vehicle_company_profile_id'
    )

  UNION ALL
  -- Legacy tables still exist (deprecated, not dropped)
  SELECT 7,
    'check_v1_legacy_tables_still_exist',
    'vehicle_companies + vehicle_company_users still present',
    (
      SELECT COUNT(*) = 2
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('vehicle_companies', 'vehicle_company_users')
    )

  UNION ALL
  SELECT 8,
    'check_v1_legacy_tour_column_still_exists',
    'tours.vehicle_company_id column still present (deprecated)',
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tours'
        AND column_name = 'vehicle_company_id'
    )

  UNION ALL
  -- Profile-based helper functions
  SELECT 9,
    'check_v2_profile_helper_fn',
    'auth_user_vehicle_company_profile_id() exists',
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'auth_user_vehicle_company_profile_id'
    )

  UNION ALL
  SELECT 10,
    'check_v2_owns_tour_uses_profile',
    'vehicle_company_owns_tour references vehicle_company_profile_id',
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'vehicle_company_owns_tour'
        AND pg_get_functiondef(p.oid) LIKE '%vehicle_company_profile_id%'
    )

  UNION ALL
  -- Recall RPC clears profile assignment
  SELECT 11,
    'check_v2_recall_clears_profile_id',
    'recall_tour_vehicle_cleanup clears vehicle_company_profile_id',
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'recall_tour_vehicle_cleanup'
        AND pg_get_functiondef(p.oid) LIKE '%vehicle_company_profile_id = NULL%'
    )

  UNION ALL
  SELECT 12,
    'check_v2_recall_still_deletes_reports',
    'recall_tour_vehicle_cleanup deletes vehicle_route_reports',
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'recall_tour_vehicle_cleanup'
        AND pg_get_functiondef(p.oid) LIKE '%DELETE FROM public.vehicle_route_reports%'
    )

  UNION ALL
  -- Profile-based RLS policies
  SELECT 13,
    'check_v2_tours_vehicle_select_policy',
    'tours_vehicle_company_select uses vehicle_company_profile_id',
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'tours'
        AND policyname = 'tours_vehicle_company_select'
        AND qual LIKE '%vehicle_company_profile_id%'
    )

  UNION ALL
  SELECT 14,
    'check_v2_reports_vehicle_select_policy',
    'vehicle_route_reports_vehicle_select uses vehicle_company_profile_id',
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'vehicle_route_reports'
        AND policyname = 'vehicle_route_reports_vehicle_select'
        AND qual LIKE '%vehicle_company_profile_id%'
    )

  UNION ALL
  SELECT 15,
    'check_v2_reports_vehicle_insert_policy',
    'vehicle_route_reports_vehicle_insert uses vehicle_company_profile_id',
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'vehicle_route_reports'
        AND policyname = 'vehicle_route_reports_vehicle_insert'
        AND with_check LIKE '%vehicle_company_profile_id%'
    )

  UNION ALL
  SELECT 16,
    'check_v2_checks_vehicle_select_policy',
    'vehicle_report_checks_vehicle_select uses vehicle_company_profile_id',
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'vehicle_report_checks'
        AND policyname = 'vehicle_report_checks_vehicle_select'
        AND qual LIKE '%vehicle_company_profile_id%'
    )

  UNION ALL
  -- Branch-match trigger still present
  SELECT 17,
    'check_v2_branch_match_trigger',
    'trg_enforce_tour_vehicle_company_branch_match on tours',
    EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_enforce_tour_vehicle_company_branch_match'
        AND tgrelid = 'public.tours'::regclass
    )

  UNION ALL
  -- Settlement boundary: no settlements mutation in recall RPC
  SELECT 18,
    'check_v2_recall_no_settlement_touch',
    'recall_tour_vehicle_cleanup does not UPDATE settlements',
    NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'recall_tour_vehicle_cleanup'
        AND pg_get_functiondef(p.oid) ILIKE '%UPDATE%settlements%'
    )

) checks
ORDER BY ord;
