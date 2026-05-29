import { describe, expect, it } from 'vitest'
import { calcSettlement } from './calc'
import { MOCK_SETTLEMENT_INPUT } from './mock-data'
import {
  buildEntranceDbRows,
  buildHotelDbRows,
  buildMealDbRows,
  buildOptionDbRows,
  buildOtherDbRows,
  buildShoppingDbRows,
  mergeServerSync,
  resolveGroundFeeUsd,
  stateFromSettlementFull,
  toCalcInput,
  toDraftPayload,
  type SettlementSyncPayload,
} from './mappers'
import type { SettlementFull } from '@/types'

const SETTLEMENT_ID = '11111111-1111-1111-1111-111111111111'
const TOUR_ID = '22222222-2222-2222-2222-222222222222'

function mockSettlementFull(): SettlementFull {
  const input = MOCK_SETTLEMENT_INPUT
  const hotels = buildHotelDbRows(
    input.hotels.map((h, i) => ({
      clientId: `h-${i}`,
      hotel_name: `Hotel ${i + 1}`,
      check_in_date: null,
      nights: h.nights,
      sgl_count: h.sgl_count,
      twn_count: h.twn_count,
      trp_count: h.trp_count,
      unit_price_sgl_usd: h.unit_price_sgl_usd,
      unit_price_trp_usd: h.unit_price_trp_usd,
      guide_amount_usd: h.guide_amount_usd,
    })),
    SETTLEMENT_ID,
  ).map((row, i) => ({
    ...row,
    id: `hotel-${i}`,
    created_at: '',
    updated_at: '',
  }))

  const meals = buildMealDbRows(
    input.meals.map((m, i) => ({
      clientId: `m-${i}`,
      meal_date: null,
      restaurant_name: `Restaurant ${i + 1}`,
      pax: m.pax,
      unit_price_vnd: m.unit_price_vnd,
    })),
    SETTLEMENT_ID,
  ).map((row, i) => ({ ...row, id: `meal-${i}`, created_at: '', updated_at: '' }))

  const entrances = buildEntranceDbRows(
    input.entrances.map((e, i) => ({
      clientId: `e-${i}`,
      visit_date: null,
      attraction_name: `Place ${i + 1}`,
      pax: e.pax,
      unit_price_vnd: e.unit_price_vnd,
    })),
    SETTLEMENT_ID,
  ).map((row, i) => ({ ...row, id: `ent-${i}`, created_at: '', updated_at: '' }))

  const others = buildOtherDbRows(
    input.others.map((o, i) => ({
      clientId: `o-${i}`,
      description: `Other ${i + 1}`,
      days: o.days,
      pax: o.pax,
      unit_price_usd: o.unit_price_usd,
      unit_price_vnd: o.unit_price_vnd,
      use_days_for_usd: o.use_days_for_usd ?? false,
    })),
    SETTLEMENT_ID,
  ).map((row, i) => ({ ...row, id: `other-${i}`, created_at: '', updated_at: '' }))

  const shoppings = buildShoppingDbRows(
    input.shoppings.map((s, i) => ({
      clientId: `s-${i}`,
      visit_date: null,
      shop_name: `Shop ${i + 1}`,
      sale_usd: s.sale_usd,
      com_usd: s.com_usd,
      kb_usd: s.kb_usd,
    })),
    SETTLEMENT_ID,
  ).map((row, i) => ({ ...row, id: `shop-${i}`, created_at: '', updated_at: '' }))

  const options = buildOptionDbRows(
    input.options.map((o, i) => ({
      clientId: `opt-${i}`,
      option_date: null,
      option_name: o.is_extra_vehicle ? '차량비(추가)' : `Option ${i + 1}`,
      unit_price_usd: o.unit_price_usd,
      pax: o.pax,
      expense_usd: o.expense_usd,
      expense_vnd: o.expense_vnd,
      is_extra_vehicle: o.is_extra_vehicle ?? false,
    })),
    SETTLEMENT_ID,
    input.exchange_rate,
  ).map((row, i) => ({ ...row, id: `opt-${i}`, created_at: '', updated_at: '' }))

  return {
    id: SETTLEMENT_ID,
    tour_id: TOUR_ID,
    guide_id: 'guide-1',
    branch_id: 'branch-1',
    status: 'draft',
    year_month: '2025-11',
    exchange_rate: input.exchange_rate,
    advance_vnd: input.header.advance_vnd,
    tour_fee_usd: 0,
    ground_fee_usd: input.header.ground_fee_usd,
    charming_other_usd: input.header.charming_other_usd,
    tip_received_usd: input.header.tip_received_usd,
    option_receivable_usd: input.header.option_receivable_usd,
    tip_transfer_usd: input.header.tip_transfer_usd,
    option_credit_usd: 0,
    vehicle_fee_usd: input.header.vehicle_fee_usd,
    head_tax_usd: input.header.head_tax_usd,
    seoul_biz_fee_usd: input.header.seoul_biz_fee_usd,
    tc_guide_usd: input.header.tc_guide_usd,
    tc_company_usd: input.header.tc_company_usd,
    megugi_usd: input.header.megugi_usd,
    guide_daily_fee_usd: input.header.guide_daily_fee_usd,
    settlement_ratio: input.header.settlement_ratio,
    guide_note: null,
    admin_note: null,
    reject_reason: null,
    submitted_at: null,
    reviewed_at: null,
    paid_at: null,
    edit_requested_at: null,
    reviewed_by: null,
    edit_requested_by: null,
    sent_for_confirmation_at: null,
    sent_for_confirmation_by: null,
    guide_confirmed_at: null,
    guide_confirmed_by: null,
    clarification_requested_at: null,
    clarification_message: null,
    active_confirmation_id: null,
    guide_submit_snapshot_id: null,
    calc_summary_json: null,
    created_at: '',
    updated_at: '',
    tour: {
      id: TOUR_ID,
      tour_code: 'TEST-001',
      pattern: 'Test pattern',
      agency_name: 'Test agency',
      start_date: '2025-11-01',
      end_date: '2025-11-04',
      nights: 3,
      pax_count: 18,
      vehicle_type: '29',
      guide_id: 'guide-1',
      tc_name: 'TC',
      branch_id: 'branch-1',
      created_by: 'admin',
      created_at: '',
      updated_at: '',
    },
    hotels,
    meals,
    entrances,
    others,
    shoppings,
    options,
    receipts: [],
  }
}

describe('resolveGroundFeeUsd', () => {
  it('prefers ground_fee_usd when set', () => {
    expect(resolveGroundFeeUsd({ ground_fee_usd: 50, tour_fee_usd: 120 })).toBe(50)
  })

  it('falls back to legacy tour_fee_usd when ground is zero', () => {
    expect(resolveGroundFeeUsd({ ground_fee_usd: 0, tour_fee_usd: 120 })).toBe(120)
  })
})

describe('DB round-trip mappers', () => {
  it('stateFromSettlementFull preserves is_tip as use_days_for_usd', () => {
    const full = mockSettlementFull()
    full.others[0].is_tip = true
    full.others[1].is_tip = false

    const state = stateFromSettlementFull(full, 'Guide')
    expect(state.others[0].use_days_for_usd).toBe(true)
    expect(state.others[1].use_days_for_usd).toBe(false)
  })

  it('reload via stateFromSettlementFull yields same calcSettlement totals as source input', () => {
    const baseline = calcSettlement(MOCK_SETTLEMENT_INPUT)
    const state = stateFromSettlementFull(mockSettlementFull(), 'Guide')
    const reloaded = calcSettlement(toCalcInput(state))

    expect(reloaded.summary.income_total_usd.value).toBe(baseline.summary.income_total_usd.value)
    expect(reloaded.summary.guide_settlement_usd.value).toBe(baseline.summary.guide_settlement_usd.value)
    expect(reloaded.summary.company_grand_total_usd.value).toBeCloseTo(
      baseline.summary.company_grand_total_usd.value,
      6,
    )
    expect(reloaded.sections.hotels.company_total_usd.value).toBe(
      baseline.sections.hotels.company_total_usd.value,
    )
    expect(reloaded.sections.options.com_usd.value).toBe(baseline.sections.options.com_usd.value)
  })

  it('toDraftPayload → build*DbRows preserves calc-relevant row data', () => {
    const state = stateFromSettlementFull(mockSettlementFull(), 'Guide')
    const payload = toDraftPayload(state)
    const hotels = buildHotelDbRows(payload.hotels, SETTLEMENT_ID)

    expect(hotels[0].company_amount_usd).toBe(216)
    expect(hotels[0].sgl_count).toBe(2)
    expect(hotels[0].sort_order).toBe(0)
  })

  it('mergeServerSync assigns DB ids to draft rows by active index', () => {
    const state = stateFromSettlementFull(mockSettlementFull(), 'Guide')
    state.hotels.push({
      clientId: 'new-hotel',
      hotel_name: 'New',
      check_in_date: null,
      nights: 1,
      sgl_count: 1,
      twn_count: 0,
      trp_count: 0,
      unit_price_sgl_usd: 10,
      unit_price_trp_usd: 0,
      guide_amount_usd: 0,
    })

    const sync = {
      status: state.settlementStatus!,
      receipts: [],
      hotels: [
        ...state.hotels.filter((h) => !h.deleted).slice(0, 2).map((h, i) => ({ ...h, id: `hotel-${i}` })),
        { id: 'hotel-new', settlement_id: SETTLEMENT_ID } as SettlementFull['hotels'][number],
      ],
      meals: state.meals,
      entrances: state.entrances,
      others: state.others,
      shoppings: state.shoppings,
      options: state.options,
    }

    const merged = mergeServerSync(state, sync as unknown as SettlementSyncPayload)
    expect(merged.hotels?.find((h) => h.clientId === 'new-hotel')?.id).toBe('hotel-new')
  })
})
