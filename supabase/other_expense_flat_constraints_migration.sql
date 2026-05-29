-- Flat other-expense model: remove legacy D×E×F CHECK constraints.
--
-- Problem: buildOtherDbRows() saves entry_mode='flat' with days=0, pax=0, unit prices=0.
-- Legacy constraints (e.g. chk_days requiring days > 0) reject those inserts.
--
-- Audit query (run before/after in Supabase SQL Editor):
--   SELECT c.conname AS constraint_name,
--          pg_get_constraintdef(c.oid) AS definition
--   FROM pg_constraint c
--   JOIN pg_class t ON t.oid = c.conrelid
--   JOIN pg_namespace n ON n.oid = t.relnamespace
--   WHERE n.nspname = 'public'
--     AND t.relname = 'other_expense_items'
--     AND c.contype = 'c'
--   ORDER BY c.conname;
--
-- Known legacy names (production):
--   chk_days   — typically CHECK (days > 0) or similar
--   chk_pax    — typically CHECK (pax > 0)
-- Optional unit-price checks may also exist on unit_price_usd / unit_price_vnd.

ALTER TABLE public.other_expense_items
  DROP CONSTRAINT IF EXISTS chk_days;

ALTER TABLE public.other_expense_items
  DROP CONSTRAINT IF EXISTS chk_pax;

ALTER TABLE public.other_expense_items
  DROP CONSTRAINT IF EXISTS chk_unit_price_usd;

ALTER TABLE public.other_expense_items
  DROP CONSTRAINT IF EXISTS chk_unit_price_vnd;

ALTER TABLE public.other_expense_items
  DROP CONSTRAINT IF EXISTS chk_other_days;

ALTER TABLE public.other_expense_items
  DROP CONSTRAINT IF EXISTS chk_other_pax;

-- Drop any remaining legacy formula CHECK (days/pax/unit_price), keep entry_mode check.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'other_expense_items'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%entry_mode%'
      AND (
        pg_get_constraintdef(c.oid) ILIKE '%days%'
        OR pg_get_constraintdef(c.oid) ILIKE '%pax%'
        OR pg_get_constraintdef(c.oid) ILIKE '%unit_price%'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.other_expense_items DROP CONSTRAINT IF EXISTS %I',
      r.conname
    );
    RAISE NOTICE 'Dropped %: %', r.conname, r.def;
  END LOOP;
END $$;
