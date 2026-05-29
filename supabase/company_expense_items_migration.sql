-- Admin-only flexible company expense rows (회사 비용) — reduces R87 via O84 extension.
CREATE TABLE IF NOT EXISTS company_expense_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  amount_usd numeric NOT NULL DEFAULT 0,
  amount_vnd numeric NOT NULL DEFAULT 0,
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_expense_items_settlement_id
  ON company_expense_items(settlement_id);

COMMENT ON TABLE company_expense_items IS 'Admin-only 회사 비용 rows — prepayments/deposits; reduces company profit (R87), not Q75 or guide payout';
