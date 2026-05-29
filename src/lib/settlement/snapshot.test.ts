import { describe, expect, it } from 'vitest'
import { MOCK_SETTLEMENT_INPUT } from './mock-data'
import {
  buildSnapshotPayload,
  diffSnapshotPayloads,
  parseSnapshotPayload,
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
    tour_fee_usd: MOCK_SETTLEMENT_INPUT.header.tour_fee_usd,
    ground_fee_usd: MOCK_SETTLEMENT_INPUT.header.ground_fee_usd,
    charming_other_usd: MOCK_SETTLEMENT_INPUT.header.charming_other_usd,
    tip_received_usd: MOCK_SETTLEMENT_INPUT.header.tip_received_usd,
    option_credit_usd: MOCK_SETTLEMENT_INPUT.header.option_credit_usd,
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
})

describe('parseSnapshotPayload', () => {
  it('returns null for invalid input', () => {
    expect(parseSnapshotPayload(null)).toBeNull()
    expect(parseSnapshotPayload({})).toBeNull()
  })
})
