-- Add web-only ground fee (지상비 — company revenue)
ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS ground_fee_usd numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN settlements.ground_fee_usd IS 'Web-only ground fee (지상비) — company revenue for R87; not in Excel template';
