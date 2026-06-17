import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
  stateFromSettlementFull,
  toCalcInput,
} from './mappers'
import {
  assertGuideReadSelectCompatible,
  COMPANY_EXPENSE_ITEMS_FULL_SELECT,
  ENTRANCE_ITEMS_FULL_SELECT,
  GUIDE_READ_VIEW_COLUMNS,
  HOTEL_ITEMS_FULL_SELECT,
  LINE_ITEM_FULL_SELECT,
  MEAL_ITEMS_FULL_SELECT,
  OPTION_ITEMS_FULL_SELECT,
  OTHER_EXPENSE_ITEMS_FULL_SELECT,
  RECEIPTS_FULL_SELECT,
  SETTLEMENT_FULL_HEADER_SELECT,
  SETTLEMENT_FULL_SELECT,
  SETTLEMENT_FULL_TOUR_SELECT,
  SHOPPING_ITEMS_FULL_SELECT,
} from './settlement-full-select'
import { GUIDE_READ_SELECT_CHECKS } from './guide-read-select-validation'
import type { Receipt, SettlementFull } from '@/types'

const ROOT = join(__dirname, '..', '..', '..')

const SETTLEMENT_ID = '11111111-1111-1111-1111-111111111111'
const TOUR_ID = '22222222-2222-2222-2222-222222222222'

function buildFullFixture(): SettlementFull {
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
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
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
  ).map((row, i) => ({
    ...row,
    id: `meal-${i}`,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }))

  const entrances = buildEntranceDbRows(
    input.entrances.map((e, i) => ({
      clientId: `e-${i}`,
      visit_date: null,
      attraction_name: `Place ${i + 1}`,
      pax: e.pax,
      unit_price_vnd: e.unit_price_vnd,
    })),
    SETTLEMENT_ID,
  ).map((row, i) => ({
    ...row,
    id: `ent-${i}`,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }))

  const others = buildOtherDbRows(
    input.others.map((o, i) => ({
      clientId: `o-${i}`,
      description: `Other ${i + 1}`,
      amount_usd: o.amount_usd,
      amount_vnd: o.amount_vnd,
      note: null,
    })),
    SETTLEMENT_ID,
  ).map((row, i) => ({
    ...row,
    id: `other-${i}`,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }))

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
  ).map((row, i) => ({
    ...row,
    id: `shop-${i}`,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }))

  const options = buildOptionDbRows(
    input.options.map((o, i) => ({
      clientId: `opt-${i}`,
      option_date: null,
      option_name: o.is_extra_vehicle ? '차량비(추가)' : `Option ${i + 1}`,
      unit_price_usd: o.unit_price_usd,
      pax: o.pax,
      expense_usd: o.expense_usd,
      expense_vnd: o.expense_vnd,
      is_extra_vehicle: o.is_extra_vehicle,
    })),
    SETTLEMENT_ID,
    input.exchange_rate,
  ).map((row, i) => ({
    ...row,
    id: `opt-${i}`,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }))

  const receipts: Receipt[] = [
    {
      id: 'receipt-1',
      settlement_id: SETTLEMENT_ID,
      hotel_id: hotels[0]!.id,
      meal_id: null,
      entrance_id: null,
      other_id: null,
      shopping_id: null,
      option_id: null,
      storage_path: 'settlements/x/receipt.jpg',
      file_name: 'receipt.jpg',
      file_size: 12345,
      mime_type: 'image/jpeg',
      uploaded_by: 'guide-user',
      created_at: '2026-01-01T00:00:00Z',
    },
  ]

  return {
    id: SETTLEMENT_ID,
    tour_id: TOUR_ID,
    guide_id: 'guide-1',
    branch_id: 'branch-1',
    status: 'draft',
    year_month: '2025-11',
    exchange_rate: input.exchange_rate,
    advance_vnd: input.header.advance_vnd,
    tour_fee_usd: input.header.ground_fee_usd,
    ground_fee_usd: input.header.ground_fee_usd,
    charming_other_usd: input.header.charming_other_usd,
    tip_received_usd: input.header.tip_received_usd,
    option_receivable_usd: input.header.option_receivable_usd ?? 0,
    tip_transfer_usd: input.header.tip_transfer_usd ?? 0,
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
    calc_summary_json: { guide_payout_usd: 100 },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    tour: {
      id: TOUR_ID,
      tour_code: 'T-001',
      pattern: 'Pattern A',
      agency_name: 'Agency',
      start_date: '2025-11-01',
      end_date: '2025-11-05',
      nights: 4,
      pax_count: 20,
      vehicle_type: '45',
      guide_id: 'guide-1',
      tc_name: 'TC',
      branch_id: 'branch-1',
      assignment_status: 'assigned',
      recalled_at: null,
      recalled_by: null,
      created_by: 'admin-1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    hotels,
    meals,
    entrances,
    others,
    shoppings,
    options,
    company_expenses: [],
    receipts,
  }
}

function narrowFullShape(full: SettlementFull): SettlementFull {
  const tour = full.tour
  const narrowTour = {
    id: tour.id,
    tour_code: tour.tour_code,
    pattern: tour.pattern,
    agency_name: tour.agency_name,
    start_date: tour.start_date,
    end_date: tour.end_date,
    nights: tour.nights,
    pax_count: tour.pax_count,
    vehicle_type: tour.vehicle_type,
    tc_name: tour.tc_name,
  }

  const pick = <T extends Record<string, unknown>>(row: T, keys: string[]) => {
    const out: Record<string, unknown> = { settlement_id: full.id }
    for (const key of keys) out[key] = row[key]
    return out
  }

  return {
    ...full,
    created_at: undefined as unknown as string,
    updated_at: undefined as unknown as string,
    tour: narrowTour as SettlementFull['tour'],
    hotels: full.hotels.map((r) =>
      pick(r as unknown as Record<string, unknown>, HOTEL_ITEMS_FULL_SELECT.split(',').map((c) => c.trim())),
    ) as unknown as SettlementFull['hotels'],
    meals: full.meals.map((r) =>
      pick(r as unknown as Record<string, unknown>, MEAL_ITEMS_FULL_SELECT.split(',').map((c) => c.trim())),
    ) as unknown as SettlementFull['meals'],
    entrances: full.entrances.map((r) =>
      pick(r as unknown as Record<string, unknown>, ENTRANCE_ITEMS_FULL_SELECT.split(',').map((c) => c.trim())),
    ) as unknown as SettlementFull['entrances'],
    others: full.others.map((r) =>
      pick(
        r as unknown as Record<string, unknown>,
        OTHER_EXPENSE_ITEMS_FULL_SELECT.split(',').map((c) => c.trim()),
      ),
    ) as unknown as SettlementFull['others'],
    shoppings: full.shoppings.map((r) =>
      pick(r as unknown as Record<string, unknown>, SHOPPING_ITEMS_FULL_SELECT.split(',').map((c) => c.trim())),
    ) as unknown as SettlementFull['shoppings'],
    options: full.options.map((r) =>
      pick(r as unknown as Record<string, unknown>, OPTION_ITEMS_FULL_SELECT.split(',').map((c) => c.trim())),
    ) as unknown as SettlementFull['options'],
    receipts: full.receipts.map((r) =>
      pick(r as unknown as Record<string, unknown>, RECEIPTS_FULL_SELECT.split(',').map((c) => c.trim())),
    ) as unknown as SettlementFull['receipts'],
  }
}

describe('settlement full select constants', () => {
  it('does not use star selects in getSettlementFull loaders', () => {
    const actions = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')
    const start = actions.indexOf('async function loadSettlementCore')
    const end = actions.indexOf('function emptyAdminSettlementsPage', start)
    const body = actions.slice(start, end)

    expect(body).toContain('SETTLEMENT_FULL_SELECT')
    expect(body).toContain('lineItemSelect(')
    expect(body).toContain('COMPANY_EXPENSE_ITEMS_FULL_SELECT')
    expect(body).not.toMatch(/loadSettlementCore[\s\S]*\.select\('\*'\)/)
    expect(body).not.toMatch(/loadSettlementLineItemRows[\s\S]*\.select\('\*'\)/)
    expect(body).not.toContain(".select('*, tour:tours(*)')")
  })

  it('getSettlementFull reuses loadSettlementCore and loadSettlementLineItemRows', () => {
    const actions = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')
    const start = actions.indexOf('export async function getSettlementFull')
    const end = actions.indexOf('function emptyAdminSettlementsPage', start)
    const body = actions.slice(start, end)

    expect(body).toContain('loadSettlementCore(')
    expect(body).toContain('loadSettlementLineItemRows(')
    expect(body).not.toContain(".select('*')")
  })

  it('keeps Claude-mandated settlement and line-item fields in select strings', () => {
    for (const field of [
      'submitted_at',
      'reviewed_at',
      'paid_at',
      'edit_requested_at',
      'reviewed_by',
      'edit_requested_by',
      'calc_summary_json',
    ]) {
      expect(SETTLEMENT_FULL_HEADER_SELECT).toContain(field)
    }

    expect(MEAL_ITEMS_FULL_SELECT).toContain('amount_vnd')
    expect(ENTRANCE_ITEMS_FULL_SELECT).toContain('amount_vnd')
    expect(HOTEL_ITEMS_FULL_SELECT).toContain('company_amount_usd')
    expect(OPTION_ITEMS_FULL_SELECT).toContain('total_sale_usd')
    expect(OPTION_ITEMS_FULL_SELECT).toContain('com_usd')

    for (const tableSelect of [
      HOTEL_ITEMS_FULL_SELECT,
      MEAL_ITEMS_FULL_SELECT,
      ENTRANCE_ITEMS_FULL_SELECT,
      OTHER_EXPENSE_ITEMS_FULL_SELECT,
      SHOPPING_ITEMS_FULL_SELECT,
      OPTION_ITEMS_FULL_SELECT,
      COMPANY_EXPENSE_ITEMS_FULL_SELECT,
    ]) {
      expect(tableSelect).toContain('sort_order')
    }

    for (const field of [
      'file_size',
      'mime_type',
      'uploaded_by',
      'created_at',
      'storage_path',
      'file_name',
      'hotel_id',
      'meal_id',
      'entrance_id',
      'other_id',
      'shopping_id',
      'option_id',
    ]) {
      expect(RECEIPTS_FULL_SELECT).toContain(field)
    }

    expect(SETTLEMENT_FULL_SELECT).toContain(`tour:tours(${SETTLEMENT_FULL_TOUR_SELECT})`)
    expect(SETTLEMENT_FULL_TOUR_SELECT).not.toContain('*')
  })

  it('guide read view compatibility for explicit hotel and shopping selects', () => {
    expect(() => assertGuideReadSelectCompatible('hotel_items', 'hotel_items_guide_read')).not.toThrow()
    expect(() => assertGuideReadSelectCompatible('shopping_items', 'shopping_items_guide_read')).not.toThrow()
    expect(() => assertGuideReadSelectCompatible('receipts', 'receipts_guide_read')).not.toThrow()
    expect(() => assertGuideReadSelectCompatible('meal_items', 'meal_items_guide_read')).not.toThrow()
    expect(() => assertGuideReadSelectCompatible('entrance_items', 'entrance_items_guide_read')).not.toThrow()
    expect(() => assertGuideReadSelectCompatible('other_expense_items', 'other_expense_items_guide_read')).not.toThrow()
    expect(() => assertGuideReadSelectCompatible('option_items', 'option_items_guide_read')).not.toThrow()

    for (const col of SETTLEMENT_FULL_HEADER_SELECT.split(',').map((c) => c.trim())) {
      expect(GUIDE_READ_VIEW_COLUMNS.settlements_guide_read).toContain(col)
    }
  })

  it('documents guide read wildcard views — structural only; live proof in guide-read-select-validation.live.test.ts', () => {
    expect(GUIDE_READ_VIEW_COLUMNS.meal_items_guide_read).toEqual(['*'])
    expect(GUIDE_READ_VIEW_COLUMNS.receipts_guide_read).toEqual(['*'])
    expect(GUIDE_READ_SELECT_CHECKS).toHaveLength(8)
  })
})

function stripLineItemAuditFields(row: Record<string, unknown>): Record<string, unknown> {
  const { created_at: _c, updated_at: _u, settlement_id: _s, ...rest } = row
  return rest
}

describe('settlement full golden hydrate parity', () => {
  it('narrowed shape hydrates and calculates identically to full fixture', () => {
    const full = buildFullFixture()
    const narrowed = narrowFullShape(full)

    const fullState = stateFromSettlementFull(full, 'Guide')
    const narrowState = stateFromSettlementFull(narrowed, 'Guide')

    expect(narrowState.exchange_rate).toBe(fullState.exchange_rate)
    expect(narrowState.header).toEqual(fullState.header)
    expect(narrowState.hotels.map((r) => stripLineItemAuditFields(r as unknown as Record<string, unknown>))).toEqual(
      fullState.hotels.map((r) => stripLineItemAuditFields(r as unknown as Record<string, unknown>)),
    )
    expect(narrowState.meals.map((r) => stripLineItemAuditFields(r as unknown as Record<string, unknown>))).toEqual(
      fullState.meals.map((r) => stripLineItemAuditFields(r as unknown as Record<string, unknown>)),
    )
    expect(narrowState.entrances.map((r) => stripLineItemAuditFields(r as unknown as Record<string, unknown>))).toEqual(
      fullState.entrances.map((r) => stripLineItemAuditFields(r as unknown as Record<string, unknown>)),
    )
    expect(narrowState.others.map((r) => stripLineItemAuditFields(r as unknown as Record<string, unknown>))).toEqual(
      fullState.others.map((r) => stripLineItemAuditFields(r as unknown as Record<string, unknown>)),
    )
    expect(narrowState.shoppings.map((r) => stripLineItemAuditFields(r as unknown as Record<string, unknown>))).toEqual(
      fullState.shoppings.map((r) => stripLineItemAuditFields(r as unknown as Record<string, unknown>)),
    )
    expect(narrowState.options.map((r) => stripLineItemAuditFields(r as unknown as Record<string, unknown>))).toEqual(
      fullState.options.map((r) => stripLineItemAuditFields(r as unknown as Record<string, unknown>)),
    )
    expect(narrowState.receipts.map((r) => r.id)).toEqual(fullState.receipts.map((r) => r.id))
    expect(narrowState.tour?.tour_code).toBe(fullState.tour?.tour_code)

    const fullCalc = calcSettlement(toCalcInput(fullState))
    const narrowCalc = calcSettlement(toCalcInput(narrowState))
    expect(narrowCalc.summary).toEqual(fullCalc.summary)
    expect(narrowCalc.sections).toEqual(fullCalc.sections)
  })

  it('receipt rows retain fields required for preview/delete paths', () => {
    const full = buildFullFixture()
    const narrowed = narrowFullShape(full)
    const receipt = narrowed.receipts[0]!

    expect(receipt.id).toBeTruthy()
    expect(receipt.storage_path).toBeTruthy()
    expect(receipt.file_name).toBeTruthy()
    expect(receipt.mime_type).toBe('image/jpeg')
    expect(receipt.file_size).toBeGreaterThan(0)
    expect(receipt.uploaded_by).toBeTruthy()
    expect(receipt.hotel_id).toBeTruthy()
    expect(receipt.created_at).toBeTruthy()
  })
})

describe('settlement full payload estimate', () => {
  it('structural estimate shows reduction from removed tour and audit columns', () => {
    const full = buildFullFixture()
    const narrowed = narrowFullShape(full)
    const fullBytes = JSON.stringify(full).length
    const narrowBytes = JSON.stringify(narrowed).length
    expect(narrowBytes).toBeLessThan(fullBytes)
  })
})
