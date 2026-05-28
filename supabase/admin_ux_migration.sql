-- Admin list UX: guide display names + denormalized calc summary on settlements
-- Run in Supabase SQL editor after settlement_confirmation_migration.sql

-- 1) Guide display names on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS korean_name text,
  ADD COLUMN IF NOT EXISTS vietnamese_name text;

COMMENT ON COLUMN public.profiles.korean_name IS 'Admin list: primary guide display name (KO)';
COMMENT ON COLUMN public.profiles.vietnamese_name IS 'Admin list: secondary guide display name (VI)';

-- 2) Cached calc totals for admin list (Q75 / P85 / R87)
ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS calc_summary_json jsonb;

COMMENT ON COLUMN public.settlements.calc_summary_json IS
  'Denormalized calc summary: company_deposit_usd, guide_payout_usd, guide_settlement_usd, company_grand_total_usd';

-- Optional: backfill existing rows (run after deploy — requires line items present)
-- UPDATE settlements s SET calc_summary_json = ... (app backfill script or manual)
