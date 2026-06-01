-- settlement line-item tables — unified RLS (remaining tables)
-- Run in Supabase Dashboard → SQL Editor AFTER role_separation_migration.sql
--
-- Applies unified *_settlement_access policy to tables not yet migrated.
-- hotel_items may already have hotel_items_settlement_access — safe to re-run.
-- Does NOT touch company_expense_items (admin-tier-only policy applied separately).
--
-- Safe to re-run: RLS policies only. No DROP COLUMN, DELETE, TRUNCATE, or data UPDATE.

-- ── Prerequisite helpers (idempotent) ────────────────────────────────────────

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

-- ── Helper: drop all policies on one table, create unified policy ─────────────

CREATE OR REPLACE FUNCTION public.apply_settlement_line_item_rls(p_table regclass)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pol RECORD;
  v_table_name text := p_table::text;
  v_short_name text := replace(v_table_name, 'public.', '');
  v_policy_name text := v_short_name || '_settlement_access';
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = v_short_name
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', pol.policyname, p_table);
  END LOOP;

  EXECUTE format(
    'CREATE POLICY %I ON %s FOR ALL TO authenticated '
    || 'USING (public.auth_user_can_access_settlement(settlement_id)) '
    || 'WITH CHECK (public.auth_user_can_access_settlement(settlement_id))',
    v_policy_name,
    p_table
  );
END;
$$;

-- ── Apply to each remaining line-item table (one transaction) ────────────────

BEGIN;

SELECT public.apply_settlement_line_item_rls('public.meal_items'::regclass);
SELECT public.apply_settlement_line_item_rls('public.entrance_items'::regclass);
SELECT public.apply_settlement_line_item_rls('public.shopping_items'::regclass);
SELECT public.apply_settlement_line_item_rls('public.option_items'::regclass);
SELECT public.apply_settlement_line_item_rls('public.other_expense_items'::regclass);
SELECT public.apply_settlement_line_item_rls('public.receipts'::regclass);

-- Re-apply hotel_items so all tables share the same policy name pattern
SELECT public.apply_settlement_line_item_rls('public.hotel_items'::regclass);

COMMIT;

DROP FUNCTION IF EXISTS public.apply_settlement_line_item_rls(regclass);

-- ── Verification (run after COMMIT) ────────────────────────────────────────
--
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'hotel_items', 'meal_items', 'entrance_items', 'other_expense_items',
--     'shopping_items', 'option_items', 'receipts'
--   )
-- ORDER BY tablename;
--
-- Expected: 7 rows, each policyname = {tablename}_settlement_access, cmd = ALL
