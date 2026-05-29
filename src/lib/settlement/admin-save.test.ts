import { describe, expect, it } from 'vitest'
import { MOCK_SETTLEMENT_INPUT } from './mock-data'
import { buildSnapshotPayload, diffSnapshotPayloads } from './snapshot'
import { buildHotelDbRows, sanitizeAdminDraftPayload, stateFromSettlementFull, toDraftPayload } from './mappers'
import { emptyHotelRow } from './defaults'
import type { SettlementFull } from '@/types'
import { assertAdminSaveSettlement } from './status-guards'

function mockSubmittedSettlement(): SettlementFull {
  const input = MOCK_SETTLEMENT_INPUT
  return {
    id: 'settlement-1',
    tour_id: 'tour-1',
    guide_id: 'guide-1',
    branch_id: 'branch-1',
    status: 'submitted',
    year_month: '2025-11',
    exchange_rate: input.exchange_rate,
    advance_vnd: input.header.advance_vnd,
    tour_fee_usd: 0,
    ground_fee_usd: 500,
    charming_other_usd: input.header.charming_other_usd,
    tip_received_usd: input.header.tip_received_usd,
    option_receivable_usd: input.header.option_receivable_usd,
    tip_transfer_usd: input.header.tip_transfer_usd,
    option_credit_usd: 0,
    vehicle_fee_usd: 10,
    head_tax_usd: 5,
    seoul_biz_fee_usd: 3,
    tc_guide_usd: input.header.tc_guide_usd,
    tc_company_usd: 8,
    megugi_usd: 2,
    guide_daily_fee_usd: 15,
    settlement_ratio: 0.5,
    guide_note: 'guide note',
    admin_note: null,
    reject_reason: null,
    submitted_at: '2026-05-27T00:00:00Z',
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
    guide_submit_snapshot_id: 'snap-guide',
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
      company_amount_usd: 100,
      guide_amount_usd: 80,
      sort_order: 0,
      created_at: '',
      updated_at: '',
    }],
    meals: [],
    entrances: [],
    others: [],
    shoppings: [{
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
    }],
    options: [],
    receipts: [],
  }
}

describe('assertAdminSaveSettlement', () => {
  it('allows admin/staff on submitted and clarification_requested', () => {
    expect(assertAdminSaveSettlement('admin', 'submitted').ok).toBe(true)
    expect(assertAdminSaveSettlement('staff', 'clarification_requested').ok).toBe(true)
  })

  it('denies guide and invalid statuses', () => {
    expect(assertAdminSaveSettlement('guide', 'submitted').ok).toBe(false)
    expect(assertAdminSaveSettlement('admin', 'pending_guide_confirmation').ok).toBe(false)
    expect(assertAdminSaveSettlement('admin', 'approved').ok).toBe(false)
  })
})

describe('sanitizeAdminDraftPayload', () => {
  it('preserves guide-owned header and line items when admin tries to overwrite', () => {
    const existing = mockSubmittedSettlement()
    const state = stateFromSettlementFull(existing, 'Guide')
    state.header.ground_fee_usd = 999
    state.header.megugi_usd = 99
    state.header.guide_daily_fee_usd = 88
    state.hotels[0].guide_amount_usd = 999
    state.shoppings[0].sale_usd = 999

    const sanitized = sanitizeAdminDraftPayload(toDraftPayload(state), existing)

    expect(sanitized.header.ground_fee_usd).toBe(999)
    expect(sanitized.header.megugi_usd).toBe(99)
    expect(sanitized.header.guide_daily_fee_usd).toBe(88)
    expect(sanitized.hotels[0].guide_amount_usd).toBe(80)
    expect(sanitized.shoppings[0].sale_usd).toBe(100)
    expect(sanitized.exchange_rate).toBe(existing.exchange_rate)
  })

  it('persists admin-added hotel rows through sanitizeAdminDraftPayload', () => {
    const existing = { ...mockSubmittedSettlement(), hotels: [] }
    const state = stateFromSettlementFull(existing, 'Guide')
    state.hotels.push({
      ...emptyHotelRow(),
      clientId: 'admin-hotel-new',
      unit_price_sgl_usd: 62,
      unit_price_trp_usd: 48,
    })

    const sanitized = sanitizeAdminDraftPayload(toDraftPayload(state), existing)

    expect(sanitized.hotels).toHaveLength(1)
    expect(sanitized.hotels[0].unit_price_sgl_usd).toBe(62)
    expect(sanitized.hotels[0].unit_price_trp_usd).toBe(48)
    expect(sanitized.hotels[0].guide_amount_usd).toBe(0)

    const dbRows = buildHotelDbRows(sanitized.hotels, existing.id)
    expect(dbRows).toHaveLength(1)
    expect(dbRows[0].unit_price_sgl_usd).toBe(62)
    expect(dbRows[0].unit_price_trp_usd).toBe(48)
    expect(dbRows[0].company_amount_usd).toBe(0)
  })

  it('keeps submitted status context via unchanged guide fields for diff baseline', () => {
    const existing = mockSubmittedSettlement()
    const before = buildSnapshotPayload(existing)

    const state = stateFromSettlementFull(existing, 'Guide')
    state.header.ground_fee_usd = 600
    state.header.megugi_usd = 20
    state.header.guide_daily_fee_usd = 25
    const sanitized = sanitizeAdminDraftPayload(toDraftPayload(state), existing)

    const afterFull = {
      ...existing,
      ground_fee_usd: sanitized.header.ground_fee_usd,
      megugi_usd: sanitized.header.megugi_usd,
      guide_daily_fee_usd: sanitized.header.guide_daily_fee_usd,
    }
    const after = buildSnapshotPayload(afterFull)

    const changes = diffSnapshotPayloads(before, after)
    expect(changes.some((c) => c.field_path === 'header.ground_fee_usd')).toBe(true)
    expect(changes.some((c) => c.field_path === 'header.megugi_usd')).toBe(true)
    expect(changes.some((c) => c.field_path === 'header.guide_daily_fee_usd')).toBe(true)
  })

  it('diff includes strict admin and company review fields after admin save', () => {
    const existing = mockSubmittedSettlement()
    const before = buildSnapshotPayload(existing)

    const state = stateFromSettlementFull(existing, 'Guide')
    state.header.ground_fee_usd = 650
    state.header.vehicle_fee_usd = 50
    state.header.megugi_usd = 20
    state.header.guide_daily_fee_usd = 25
    const sanitized = sanitizeAdminDraftPayload(toDraftPayload(state), existing)

    const afterFull: SettlementFull = {
      ...existing,
      ground_fee_usd: sanitized.header.ground_fee_usd,
      vehicle_fee_usd: sanitized.header.vehicle_fee_usd,
      head_tax_usd: sanitized.header.head_tax_usd,
      seoul_biz_fee_usd: sanitized.header.seoul_biz_fee_usd,
      tc_company_usd: sanitized.header.tc_company_usd,
      megugi_usd: sanitized.header.megugi_usd,
      guide_daily_fee_usd: sanitized.header.guide_daily_fee_usd,
      settlement_ratio: sanitized.header.settlement_ratio,
    }
    const changes = diffSnapshotPayloads(before, buildSnapshotPayload(afterFull))

    expect(changes.some((c) => c.field_path === 'header.ground_fee_usd')).toBe(true)
    expect(changes.some((c) => c.field_path === 'header.vehicle_fee_usd')).toBe(true)
    expect(changes.some((c) => c.field_path === 'header.megugi_usd')).toBe(true)
    expect(changes.some((c) => c.field_path === 'header.guide_daily_fee_usd')).toBe(true)
  })
})
