import type { SettlementCalcInput } from './types-calc'

/** Mock tour metadata for Phase 2 UI (not part of calc input). */
export const MOCK_TOUR_INFO = {
  tour_code: 'DN-2025-1101',
  pattern: '다낭(3N), 호이안',
  agency_name: '모두 투어',
  start_date: '2025-11-01',
  end_date: '2025-11-04',
  pax_count: 18,
  nights: 3,
  vehicle_type: '29인승',
  guide_name: '김가이드',
  tc_name: '박TC',
  year_month: '2025-11',
}

/** Representative settlement input — mirrors Excel template structure. */
export const MOCK_SETTLEMENT_INPUT: SettlementCalcInput = {
  exchange_rate: 26000,
  header: {
    advance_vnd: 5_200_000,
    charming_other_usd: 30,
    tip_received_usd: 45,
    option_credit_usd: 0,
    tour_fee_usd: 120,
    ground_fee_usd: 0,
    vehicle_fee_usd: 25,
    head_tax_usd: 8,
    seoul_biz_fee_usd: 5,
    tc_guide_usd: 12,
    tc_company_usd: 8,
    megugi_usd: 3,
    guide_daily_fee_usd: 20,
    settlement_ratio: 0.5,
  },
  hotels: [
    {
      sgl_count: 2,
      twn_count: 4,
      trp_count: 0,
      nights: 3,
      unit_price_sgl_usd: 12,
      unit_price_trp_usd: 10,
      guide_amount_usd: 15,
    },
    {
      sgl_count: 0,
      twn_count: 2,
      trp_count: 1,
      nights: 2,
      unit_price_sgl_usd: 15,
      unit_price_trp_usd: 12,
      guide_amount_usd: 8,
    },
  ],
  meals: [
    { pax: 18, unit_price_vnd: 85000 },
    { pax: 18, unit_price_vnd: 120000 },
    { pax: 12, unit_price_vnd: 95000 },
  ],
  entrances: [
    { pax: 18, unit_price_vnd: 150000 },
    { pax: 18, unit_price_vnd: 80000 },
  ],
  others: [
    { days: 4, pax: 1, unit_price_usd: 10, unit_price_vnd: 0, use_days_for_usd: true },
    { days: 4, pax: 1, unit_price_usd: 5, unit_price_vnd: 0, use_days_for_usd: true },
    { days: null, pax: 3, unit_price_usd: 15, unit_price_vnd: 0 },
    { days: null, pax: 2, unit_price_usd: 0, unit_price_vnd: 200000 },
  ],
  shoppings: [
    { sale_usd: 80, com_usd: 24, kb_usd: 6 },
    { sale_usd: 120, com_usd: 36, kb_usd: 10 },
  ],
  options: [
    { unit_price_usd: 25, pax: 8, expense_usd: 20, expense_vnd: 520000 },
    { unit_price_usd: 15, pax: 6, expense_usd: 10, expense_vnd: 0 },
    { unit_price_usd: 0, pax: 0, expense_usd: 35, expense_vnd: 780000, is_extra_vehicle: true },
  ],
}
