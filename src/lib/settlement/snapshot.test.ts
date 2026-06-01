import { describe, expect, it } from 'vitest'
import { MOCK_SETTLEMENT_INPUT } from './mock-data'
import {
  buildSnapshotPayload,
  diffSnapshotPayloads,
  filterGuideConfirmationChanges,
  isGuideHiddenConfirmChange,
  parseSnapshotPayload,
  redactCalcSummaryJsonForGuide,
  sanitizeSettlementForGuide,
  sanitizeSettlementFullForGuide,
  sanitizeSettlementSyncForGuide,
  stripKbFromGuideSnapshotPayload,
} from './snapshot'
import type { SettlementFull } from '@/types'

function minimalSettlementFull(overrides: Partial<SettlementFull> = {}): SettlementFull {
  return {
    id: 'settlement-1',
    tour_id: 'tour-1',
    guide_id: 'guide-1',
    branch_id: 'branch-1',
    status: 'submitted',
    year_month: '2025-11',
    exchange_rate: MOCK_SETTLEMENT_INPUT.exchange_rate,
    advance_vnd: MOCK_SETTLEMENT_INPUT.header.advance_vnd,
    tour_fee_usd: 0,
    ground_fee_usd: MOCK_SETTLEMENT_INPUT.header.ground_fee_usd,
    charming_other_usd: MOCK_SETTLEMENT_INPUT.header.charming_other_usd,
    tip_received_usd: MOCK_SETTLEMENT_INPUT.header.tip_received_usd,
    option_receivable_usd: MOCK_SETTLEMENT_INPUT.header.option_receivable_usd,
    tip_transfer_usd: MOCK_SETTLEMENT_INPUT.header.tip_transfer_usd,
    option_credit_usd: 0,
    vehicle_fee_usd: MOCK_SETTLEMENT_INPUT.header.vehicle_fee_usd,
    head_tax_usd: MOCK_SETTLEMENT_INPUT.header.head_tax_usd,
    seoul_biz_fee_usd: MOCK_SETTLEMENT_INPUT.header.seoul_biz_fee_usd,
    tc_guide_usd: MOCK_SETTLEMENT_INPUT.header.tc_guide_usd,
    tc_company_usd: MOCK_SETTLEMENT_INPUT.header.tc_company_usd,
    megugi_usd: MOCK_SETTLEMENT_INPUT.header.megugi_usd,
    guide_daily_fee_usd: MOCK_SETTLEMENT_INPUT.header.guide_daily_fee_usd,
    settlement_ratio: MOCK_SETTLEMENT_INPUT.header.settlement_ratio,
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
      id: 'tour-1',
      tour_code: 'TEST',
      pattern: 'Test',
      agency_name: 'Agency',
      start_date: '2025-11-01',
      end_date: '2025-11-04',
      nights: 3,
      pax_count: 18,
      vehicle_type: '29',
      guide_id: 'guide-1',
      tc_name: null,
      branch_id: 'branch-1',
      created_by: 'admin',
      created_at: '',
      updated_at: '',
    },
    hotels: [],
    meals: [],
    entrances: [],
    others: [],
    shoppings: [],
    options: [],
    company_expenses: [],
    receipts: [],
    ...overrides,
  }
}

describe('buildSnapshotPayload', () => {
  it('includes calc summary fields', () => {
    const payload = buildSnapshotPayload(minimalSettlementFull())
    expect(payload.calc_summary).toMatchObject({
      company_deposit_usd: expect.any(Number),
      guide_settlement_usd: expect.any(Number),
      guide_payout_usd: expect.any(Number),
      company_grand_total_usd: expect.any(Number),
    })
  })
})

describe('diffSnapshotPayloads', () => {
  it('returns only changed admin header and calc fields', () => {
    const before = buildSnapshotPayload(minimalSettlementFull())
    const after = buildSnapshotPayload(
      minimalSettlementFull({
        megugi_usd: before.header.megugi_usd as number + 10,
        guide_daily_fee_usd: before.header.guide_daily_fee_usd as number + 5,
      }),
    )

    const changes = diffSnapshotPayloads(before, after)
    const paths = changes.map((c) => c.field_path)

    expect(paths).toContain('header.megugi_usd')
    expect(paths).toContain('header.guide_daily_fee_usd')
    expect(changes.find((c) => c.field_path === 'header.megugi_usd')?.new_display).toMatch(/^\$/)
    expect(changes.every((c) => c.old_display !== c.new_display)).toBe(true)
  })

  it('returns empty when payloads are identical', () => {
    const payload = buildSnapshotPayload(minimalSettlementFull())
    expect(diffSnapshotPayloads(payload, payload)).toEqual([])
  })

  it('detects hotel unit price changes by row id', () => {
    const before = buildSnapshotPayload(
      minimalSettlementFull({
        hotels: [{
          id: 'hotel-1',
          settlement_id: 'settlement-1',
          hotel_name: 'Hotel A',
          check_in_date: null,
          nights: 2,
          sgl_count: 1,
          twn_count: 0,
          trp_count: 0,
          unit_price_sgl_usd: 50,
          unit_price_trp_usd: 40,
          company_amount_usd: 0,
          guide_amount_usd: 100,
          sort_order: 0,
          created_at: '',
          updated_at: '',
        }],
      }),
    )
    const afterPayload = structuredClone(before)
    afterPayload.hotels[0].unit_price_sgl_usd = 60

    const changes = diffSnapshotPayloads(before, afterPayload)
    expect(changes.some((c) => c.field_path === 'hotels.hotel-1.unit_price_sgl_usd')).toBe(true)
  })

  it('includes KB changes in full diff but hides them from guide filter', () => {
    const shop = {
      id: 'shop-1',
      settlement_id: 'settlement-1',
      visit_date: null,
      shop_name: 'Shop A',
      sale_usd: 100,
      com_usd: 20,
      kb_usd: 5,
      sort_order: 0,
      created_at: '',
      updated_at: '',
    }
    const before = buildSnapshotPayload(minimalSettlementFull({ shoppings: [shop] }))
    const after = buildSnapshotPayload(
      minimalSettlementFull({ shoppings: [{ ...shop, kb_usd: 20 }] }),
    )
    const allChanges = diffSnapshotPayloads(before, after)
    expect(allChanges.some((c) => c.field_path === 'shoppings.shop-1.kb_usd')).toBe(true)
    expect(filterGuideConfirmationChanges(allChanges)).toEqual([])
  })
})

describe('stripKbFromGuideSnapshotPayload', () => {
  it('removes kb_usd from shopping rows', () => {
    const payload = buildSnapshotPayload(
      minimalSettlementFull({
        shoppings: [{
          id: 'shop-1',
          settlement_id: 'settlement-1',
          visit_date: null,
          shop_name: 'Shop A',
          sale_usd: 100,
          com_usd: 20,
          kb_usd: 12,
          sort_order: 0,
          created_at: '',
          updated_at: '',
        }],
      }),
    )
    const stripped = stripKbFromGuideSnapshotPayload(payload)
    expect(stripped.shoppings[0]).not.toHaveProperty('kb_usd')
    expect(stripped.shoppings[0]).toMatchObject({ sale_usd: 100, com_usd: 20 })
  })
})

describe('guide payload redaction', () => {
  it('sanitizeSettlementFullForGuide zeros admin header fields and strips KB', () => {
    const full = minimalSettlementFull({
      ground_fee_usd: 500,
      vehicle_fee_usd: 120,
      head_tax_usd: 30,
      seoul_biz_fee_usd: 40,
      calc_summary_json: {
        company_deposit_usd: 1000,
        guide_settlement_usd: 800,
        guide_payout_usd: 800,
        company_grand_total_usd: -200,
      },
      hotels: [{
        id: 'hotel-1',
        settlement_id: 'settlement-1',
        hotel_name: 'Hotel A',
        check_in_date: null,
        nights: 2,
        sgl_count: 1,
        twn_count: 0,
        trp_count: 0,
        unit_price_sgl_usd: 55,
        unit_price_trp_usd: 45,
        company_amount_usd: 110,
        guide_amount_usd: 80,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      }],
      shoppings: [{
        id: 'shop-1',
        settlement_id: 'settlement-1',
        visit_date: null,
        shop_name: 'Shop A',
        sale_usd: 100,
        com_usd: 20,
        kb_usd: 15,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      }],
      company_expenses: [{
        id: 'ce-1',
        settlement_id: 'settlement-1',
        description: 'Hidden',
        amount_usd: 99,
        amount_vnd: 0,
        note: null,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      }],
    })

    const sanitized = sanitizeSettlementFullForGuide(full)
    expect(sanitized.ground_fee_usd).toBe(0)
    expect(sanitized.vehicle_fee_usd).toBe(0)
    expect(sanitized.head_tax_usd).toBe(0)
    expect(sanitized.seoul_biz_fee_usd).toBe(0)
    expect(sanitized.hotels[0].unit_price_sgl_usd).toBe(0)
    expect(sanitized.hotels[0].unit_price_trp_usd).toBe(0)
    expect(sanitized.hotels[0].company_amount_usd).toBe(0)
    expect(sanitized.hotels[0].guide_amount_usd).toBe(80)
    expect(sanitized.shoppings[0].kb_usd).toBe(0)
    expect(sanitized.company_expenses).toEqual([])
    expect(sanitized.calc_summary_json).not.toHaveProperty('company_grand_total_usd')
    expect(sanitized.calc_summary_json).toMatchObject({
      company_deposit_usd: 1000,
      guide_settlement_usd: 800,
      guide_payout_usd: 800,
    })
  })

  it('sanitizeSettlementForGuide redacts list-row admin fields', () => {
    const row = minimalSettlementFull({
      ground_fee_usd: 300,
      vehicle_fee_usd: 50,
      calc_summary_json: { company_grand_total_usd: -100, guide_payout_usd: 400 },
    })
    const sanitized = sanitizeSettlementForGuide(row)
    expect(sanitized.ground_fee_usd).toBe(0)
    expect(sanitized.vehicle_fee_usd).toBe(0)
    expect(sanitized.calc_summary_json).not.toHaveProperty('company_grand_total_usd')
  })

  it('redactCalcSummaryJsonForGuide preserves guide-visible summary keys', () => {
    const redacted = redactCalcSummaryJsonForGuide({
      company_deposit_usd: 1,
      guide_settlement_usd: 2,
      guide_payout_usd: 3,
      company_grand_total_usd: 4,
    })
    expect(redacted).toEqual({
      company_deposit_usd: 1,
      guide_settlement_usd: 2,
      guide_payout_usd: 3,
    })
  })

  it('sanitizeSettlementSyncForGuide strips admin-only sync fields', () => {
    const sync = {
      status: 'draft' as const,
      receipts: [],
      hotels: [{
        id: 'hotel-1',
        settlement_id: 'settlement-1',
        hotel_name: 'Hotel A',
        check_in_date: null,
        nights: 2,
        sgl_count: 1,
        twn_count: 0,
        trp_count: 0,
        unit_price_sgl_usd: 55,
        unit_price_trp_usd: 45,
        company_amount_usd: 110,
        guide_amount_usd: 80,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      }],
      meals: [],
      entrances: [],
      others: [],
      company_expenses: [{
        id: 'ce-1',
        settlement_id: 'settlement-1',
        description: 'Hidden',
        amount_usd: 99,
        amount_vnd: 0,
        note: null,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      }],
      shoppings: [{
        id: 'shop-1',
        settlement_id: 'settlement-1',
        visit_date: null,
        shop_name: 'Shop A',
        sale_usd: 100,
        com_usd: 20,
        kb_usd: 15,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      }],
      options: [],
    }

    const redacted = sanitizeSettlementSyncForGuide(sync)

    expect(redacted.company_expenses).toEqual([])
    expect(redacted.shoppings[0].kb_usd).toBe(0)
    expect(redacted.hotels[0].unit_price_sgl_usd).toBe(0)
    expect(redacted.hotels[0].unit_price_trp_usd).toBe(0)
    expect(redacted.hotels[0].company_amount_usd).toBe(0)
    expect(redacted.hotels[0].guide_amount_usd).toBe(80)
    expect(redacted).not.toHaveProperty('company_grand_total_usd')
    expect(redacted).not.toHaveProperty('calc_summary_json')
  })
})

describe('parseSnapshotPayload', () => {
  it('returns null for invalid input', () => {
    expect(parseSnapshotPayload(null)).toBeNull()
    expect(parseSnapshotPayload({})).toBeNull()
  })
})
