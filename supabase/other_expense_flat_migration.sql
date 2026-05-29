-- Generic other-expense rows: optional note + internal entry_mode (flat | legacy).
-- Legacy columns (days, pax, unit_price_*, is_tip) are retained for backfill compatibility.

ALTER TABLE other_expense_items
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS entry_mode text NOT NULL DEFAULT 'legacy'
    CHECK (entry_mode IN ('legacy', 'flat'));

COMMENT ON COLUMN other_expense_items.note IS 'Optional guide note per expense line';
COMMENT ON COLUMN other_expense_items.entry_mode IS 'Internal: legacy=unit formula, flat=direct amounts';
