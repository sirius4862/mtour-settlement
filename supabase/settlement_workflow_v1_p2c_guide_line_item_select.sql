-- settlement workflow v1 - P2c: guide SELECT on editable, NON-REDACTED line-item tables
-- Run AFTER settlement_workflow_v1_p2a_public_submit_child_rls.sql
--
-- Adds guide SELECT only for: other_expense_items, meal_items, entrance_items, option_items
-- EXCLUDES hotel_items and shopping_items (their guide_read views redact company columns;
-- a base-table guide SELECT would re-expose unit_price_*/company_amount_usd/kb_usd).
--
-- Predicate (editable + guide-owned only):
--   auth_user_is_guide()
--   AND NOT auth_user_is_admin_tier()
--   AND settlement_allows_guide_content_mutation(settlement_id)
--
-- Safe to re-run: DROP POLICY IF EXISTS + CREATE.

BEGIN;

ALTER TABLE public.other_expense_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS other_expense_items_guide_select ON public.other_expense_items;
CREATE POLICY other_expense_items_guide_select
ON public.other_expense_items
FOR SELECT
TO authenticated
USING (
  public.auth_user_is_guide()
  AND NOT public.auth_user_is_admin_tier()
  AND public.settlement_allows_guide_content_mutation(settlement_id)
);

ALTER TABLE public.meal_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meal_items_guide_select ON public.meal_items;
CREATE POLICY meal_items_guide_select
ON public.meal_items
FOR SELECT
TO authenticated
USING (
  public.auth_user_is_guide()
  AND NOT public.auth_user_is_admin_tier()
  AND public.settlement_allows_guide_content_mutation(settlement_id)
);

ALTER TABLE public.entrance_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entrance_items_guide_select ON public.entrance_items;
CREATE POLICY entrance_items_guide_select
ON public.entrance_items
FOR SELECT
TO authenticated
USING (
  public.auth_user_is_guide()
  AND NOT public.auth_user_is_admin_tier()
  AND public.settlement_allows_guide_content_mutation(settlement_id)
);

ALTER TABLE public.option_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS option_items_guide_select ON public.option_items;
CREATE POLICY option_items_guide_select
ON public.option_items
FOR SELECT
TO authenticated
USING (
  public.auth_user_is_guide()
  AND NOT public.auth_user_is_admin_tier()
  AND public.settlement_allows_guide_content_mutation(settlement_id)
);

COMMIT;

-- Verify:
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('other_expense_items','meal_items','entrance_items','option_items')
--   AND cmd = 'SELECT'
-- ORDER BY tablename, policyname;
