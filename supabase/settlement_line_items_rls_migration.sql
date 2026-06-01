-- settlement line-item tables — unified RLS
-- Run in Supabase Dashboard → SQL Editor (local + production)
--
-- Symptom: "new row violates row-level security policy for table meal_items"
--          (and potentially other line-item tables) when admin saves during review.
--
-- Fix: one FOR ALL policy per table using auth_user_can_access_settlement(settlement_id).
--      company_expense_items stays admin/staff-only (guides must not read/write).
--
-- Safe to re-run: no DROP COLUMN, no DELETE/TRUNCATE, no data updates.
-- Idempotent: drops all existing policies on each target table, then recreates.

BEGIN;

-- ── Shared helper (same as hotel_items / settlement_status_logs migrations) ──

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

-- ── Apply settlement-scoped policy (guide own rows + admin/staff all settlements) ──

CREATE OR REPLACE FUNCTION public.apply_settlement_line_item_rls(p_table regclass)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pol RECORD;
  v_table_name text := p_table::text;
  v_policy_name text := replace(v_table_name, 'public.', '') || '_settlement_access';
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = replace(v_table_name, 'public.', '')
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

SELECT public.apply_settlement_line_item_rls('public.hotel_items'::regclass);
SELECT public.apply_settlement_line_item_rls('public.meal_items'::regclass);
SELECT public.apply_settlement_line_item_rls('public.entrance_items'::regclass);
SELECT public.apply_settlement_line_item_rls('public.other_expense_items'::regclass);
SELECT public.apply_settlement_line_item_rls('public.shopping_items'::regclass);
SELECT public.apply_settlement_line_item_rls('public.option_items'::regclass);
SELECT public.apply_settlement_line_item_rls('public.receipts'::regclass);

-- ── company_expense_items: admin/staff only (not visible to guides) ─────────

DO $$
DECLARE
  pol RECORD;
BEGIN
  ALTER TABLE public.company_expense_items ENABLE ROW LEVEL SECURITY;

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'company_expense_items'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.company_expense_items',
      pol.policyname
    );
  END LOOP;

  CREATE POLICY company_expense_items_admin_access
    ON public.company_expense_items
    FOR ALL
    TO authenticated
    USING (public.auth_user_is_admin_tier())
    WITH CHECK (public.auth_user_is_admin_tier());
END $$;

DROP FUNCTION IF EXISTS public.apply_settlement_line_item_rls(regclass);

COMMIT;
