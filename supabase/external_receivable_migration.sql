-- Split legacy P75 (option_credit_usd) into option receivable + tip transfer
ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS option_receivable_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tip_transfer_usd numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN settlements.option_receivable_usd IS '옵션외상 — option paid to company account, not guide on-site cash (P75 component)';
COMMENT ON COLUMN settlements.tip_transfer_usd IS '팁송금 — tip transferred to company account, not guide on-site cash (P75 component)';
COMMENT ON COLUMN settlements.option_credit_usd IS 'Legacy P75 total; kept in sync as option_receivable_usd + tip_transfer_usd';
