import { describe, expect, it } from 'vitest'
import { emptyHotelRow } from './defaults'
import { sanitizeAdminDraftPayload, stateFromSettlementFull, toDraftPayload } from './mappers'
import {
  buildSnapshotPayload,
  diffSnapshotPayloads,
  filterGuideConfirmationChanges,
} from './snapshot'
import {
  canAdminEditSettlement,
  canAdminSendForConfirmation,
} from './status-guards'
import type { SettlementFull } from '@/types'
import { MOCK_SETTLEMENT_INPUT } from './mock-data'

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
    hotels: [],
    meals: [],
    entrances: [],
    others: [],
    shoppings: [],
    options: [],
    company_expenses: [],
    receipts: [],
  }
}

describe('admin workflow status gates', () => {
  it('allows admin draft save only in submitted or clarification_requested', () => {
    expect(canAdminEditSettlement('submitted')).toBe(true)
    expect(canAdminEditSettlement('clarification_requested')).toBe(true)
    expect(canAdminEditSettlement('pending_guide_confirmation')).toBe(false)
    expect(canAdminEditSettlement('approved')).toBe(false)
  })

  it('allows send-for-confirmation only before pending_guide_confirmation', () => {
    expect(canAdminSendForConfirmation('submitted')).toBe(true)
    expect(canAdminSendForConfirmation('clarification_requested')).toBe(true)
    expect(canAdminSendForConfirmation('pending_guide_confirmation')).toBe(false)
    expect(canAdminSendForConfirmation('approved')).toBe(false)
  })

  it('admin edit and send-for-confirmation are mutually exclusive by status', () => {
    const statuses = [
      'submitted',
      'pending_guide_confirmation',
      'clarification_requested',
      'approved',
      'paid',
    ] as const
    for (const status of statuses) {
      const canEdit = canAdminEditSettlement(status)
      const canSend = canAdminSendForConfirmation(status)
      expect(canEdit && canSend).toBe(canEdit)
      if (status === 'pending_guide_confirmation') {
        expect(canEdit).toBe(false)
        expect(canSend).toBe(false)
      }
    }
  })
})

describe('admin draft save payload', () => {
  it('preserves guide-owned fields and does not change settlement status in payload', () => {
    const existing = mockSubmittedSettlement()
    const state = stateFromSettlementFull(existing, 'Guide')
    state.header.ground_fee_usd = 600
    state.header.megugi_usd = 99
    state.hotels.push({
      ...emptyHotelRow(),
      clientId: 'admin-hotel',
      unit_price_sgl_usd: 40,
      unit_price_trp_usd: 30,
    })

    const sanitized = sanitizeAdminDraftPayload(toDraftPayload(state), existing)

    expect(existing.status).toBe('submitted')
    expect(sanitized.settlementId).toBe(existing.id)
    expect(sanitized.header.ground_fee_usd).toBe(600)
    expect(sanitized.header.megugi_usd).toBe(99)
    expect(sanitized.hotels).toHaveLength(1)
    expect(sanitized.hotels[0].unit_price_sgl_usd).toBe(40)
  })
})

describe('guide confirmation diff visibility', () => {
  it('hides ground_fee_usd, KB, and company profit from guide-visible changes', () => {
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
    const before = buildSnapshotPayload(mockSubmittedSettlement())
    const after = buildSnapshotPayload({
      ...mockSubmittedSettlement(),
      ground_fee_usd: 900,
      shoppings: [{ ...shop, kb_usd: 15 }],
      vehicle_fee_usd: before.header.vehicle_fee_usd as number + 1,
    })

    const visible = filterGuideConfirmationChanges(diffSnapshotPayloads(before, after))

    expect(visible.some((c) => c.field_path === 'header.ground_fee_usd')).toBe(false)
    expect(visible.some((c) => c.field_path.includes('kb_usd'))).toBe(false)
    expect(visible.some((c) => c.field_path === 'calc_summary.company_grand_total_usd')).toBe(false)
    expect(visible.some((c) => c.field_path === 'header.vehicle_fee_usd')).toBe(true)
  })
})
