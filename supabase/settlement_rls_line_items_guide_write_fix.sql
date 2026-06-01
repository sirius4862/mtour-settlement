-- Guide line-item write RLS fix — apply after:
--   settlement_rls_hardening_migration.sql
--   settlement_rls_guide_workflow_fix.sql
--
-- Root cause: hardening removed guide SELECT on base line-item tables (redaction).
-- App used .upsert() on save draft; PostgREST upsert uses INSERT…ON CONFLICT which
-- requires SELECT on written rows when returning representation — fails RLS with
-- "new row violates row-level security policy for table meal_items" (first table
-- with rows after empty hotel_items).
--
-- Fix (SQL): strengthen settlement_allows_guide_content_mutation + re-apply guide
-- I/U/D policies with explicit guide role guard on all 7 line-item/receipt tables.
-- Does NOT add guide base SELECT (preserves redaction on hotel/shopping columns).
--
-- Fix (app): persistGuideLineItemTable — insert + per-row update, no upsert/RETURNING.
--
-- Safe to re-run.

BEGIN;

-- Ownership + editable statuses (draft | rejected | edit_requested only)
CREATE OR REPLACE FUNCTION public.settlement_allows_guide_content_mutation(p_settlement_id uuid)
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
      AND s.status IN ('draft', 'rejected', 'edit_requested')
  );
$$;

REVOKE ALL ON FUNCTION public.settlement_allows_guide_content_mutation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settlement_allows_guide_content_mutation(uuid) TO authenticated;

-- Re-apply guide write policies on one line-item / receipt table (no guide SELECT)
CREATE OR REPLACE FUNCTION public.apply_guide_line_item_write_policies(p_table regclass)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_short_name text := replace(p_table::text, 'public.', '');
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', v_short_name || '_guide_insert', p_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', v_short_name || '_guide_update', p_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', v_short_name || '_guide_delete', p_table);

  EXECUTE format(
    'CREATE POLICY %I ON %s FOR INSERT TO authenticated '
    || 'WITH CHECK ('
    || 'public.auth_user_is_guide() '
    || 'AND NOT public.auth_user_is_admin_tier() '
    || 'AND public.settlement_allows_guide_content_mutation(settlement_id))',
    v_short_name || '_guide_insert',
    p_table
  );

  EXECUTE format(
    'CREATE POLICY %I ON %s FOR UPDATE TO authenticated '
    || 'USING ('
    || 'public.auth_user_is_guide() '
    || 'AND NOT public.auth_user_is_admin_tier() '
    || 'AND public.settlement_allows_guide_content_mutation(settlement_id)) '
    || 'WITH CHECK ('
    || 'public.auth_user_is_guide() '
    || 'AND NOT public.auth_user_is_admin_tier() '
    || 'AND public.settlement_allows_guide_content_mutation(settlement_id))',
    v_short_name || '_guide_update',
    p_table
  );

  EXECUTE format(
    'CREATE POLICY %I ON %s FOR DELETE TO authenticated '
    || 'USING ('
    || 'public.auth_user_is_guide() '
    || 'AND NOT public.auth_user_is_admin_tier() '
    || 'AND public.settlement_allows_guide_content_mutation(settlement_id))',
    v_short_name || '_guide_delete',
    p_table
  );
END;
$$;

SELECT public.apply_guide_line_item_write_policies('public.hotel_items'::regclass);
SELECT public.apply_guide_line_item_write_policies('public.meal_items'::regclass);
SELECT public.apply_guide_line_item_write_policies('public.entrance_items'::regclass);
SELECT public.apply_guide_line_item_write_policies('public.other_expense_items'::regclass);
SELECT public.apply_guide_line_item_write_policies('public.shopping_items'::regclass);
SELECT public.apply_guide_line_item_write_policies('public.option_items'::regclass);
SELECT public.apply_guide_line_item_write_policies('public.receipts'::regclass);

DROP FUNCTION IF EXISTS public.apply_guide_line_item_write_policies(regclass);

COMMIT;

-- Verification:
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE tablename IN (
--   'hotel_items','meal_items','entrance_items','other_expense_items',
--   'shopping_items','option_items','receipts'
-- )
-- AND policyname LIKE '%guide%'
-- ORDER BY tablename, policyname;
--
-- Confirm no guide SELECT on base line-item tables:
-- SELECT tablename, policyname FROM pg_policies
-- WHERE tablename IN ('hotel_items','shopping_items','meal_items')
--   AND cmd = 'SELECT' AND policyname LIKE '%guide%';
