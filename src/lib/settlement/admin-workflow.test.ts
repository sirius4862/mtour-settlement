import { describe, expect, it } from 'vitest'
import { emptyHotelRow, emptyCompanyExpenseRow } from './defaults'
import {
  buildCompanyExpenseDbRows,
  sanitizeAdminDraftPayload,
  stateFromSettlementFull,
  toDraftPayload,
  emptyFormState,
} from './mappers'
import {
  assertAdminCompanyExpenseSaveAllowed,
  ADMIN_COMPANY_EXPENSE_HYDRATION_SAVE_ERROR,
} from './save-integrity'
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
      assignment_status: 'assigned',
      recalled_at: null,
      recalled_by: null,
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

  it('empty UI payload with populated existing preserves guide line items and company expenses from payload only', () => {
    const existing: SettlementFull = {
      ...mockSubmittedSettlement(),
      hotels: [
        {
          id: 'h1',
          settlement_id: 'settlement-1',
          hotel_name: 'Hotel A',
          check_in_date: null,
          nights: 2,
          sgl_count: 1,
          twn_count: 0,
          trp_count: 0,
          unit_price_sgl_usd: 50,
          unit_price_trp_usd: 0,
          company_amount_usd: 50,
          guide_amount_usd: 10,
          sort_order: 0,
          created_at: '',
          updated_at: '',
        },
      ],
      meals: [
        {
          id: 'm1',
          settlement_id: 'settlement-1',
          meal_date: null,
          restaurant_name: 'R1',
          pax: 10,
          unit_price_vnd: 0,
          amount_vnd: 100000,
          sort_order: 0,
          created_at: '',
          updated_at: '',
        },
      ],
      entrances: [
        {
          id: 'e1',
          settlement_id: 'settlement-1',
          visit_date: null,
          attraction_name: 'A1',
          pax: 5,
          unit_price_vnd: 0,
          amount_vnd: 50000,
          sort_order: 0,
          created_at: '',
          updated_at: '',
        },
      ],
      others: [
        {
          id: 'o1',
          settlement_id: 'settlement-1',
          description: 'Other',
          days: null,
          pax: 0,
          unit_price_usd: 0,
          unit_price_vnd: 0,
          amount_usd: 20,
          amount_vnd: 0,
          is_tip: false,
          entry_mode: 'flat',
          note: null,
          sort_order: 0,
          created_at: '',
          updated_at: '',
        },
      ],
      shoppings: [
        {
          id: 's1',
          settlement_id: 'settlement-1',
          visit_date: null,
          shop_name: 'Shop',
          sale_usd: 100,
          com_usd: 20,
          kb_usd: 5,
          sort_order: 0,
          created_at: '',
          updated_at: '',
        },
      ],
      options: [
        {
          id: 'opt1',
          settlement_id: 'settlement-1',
          option_date: null,
          option_name: 'Opt',
          unit_price_usd: 25,
          pax: 8,
          total_sale_usd: 200,
          expense_usd: 0,
          expense_vnd: 0,
          com_usd: 36,
          is_extra_vehicle: false,
          sort_order: 0,
          created_at: '',
          updated_at: '',
        },
      ],
      company_expenses: [
        {
          id: 'ce1',
          settlement_id: 'settlement-1',
          description: 'Co exp',
          amount_usd: 10,
          amount_vnd: 0,
          note: null,
          sort_order: 0,
          created_at: '',
          updated_at: '',
        },
      ],
    }

    const emptyUi = {
      ...emptyFormState('Admin'),
      settlementId: existing.id,
      tourId: existing.tour_id,
    }
    const sanitized = sanitizeAdminDraftPayload(toDraftPayload(emptyUi), existing)

    expect(sanitized.meals).toHaveLength(1)
    expect(sanitized.entrances).toHaveLength(1)
    expect(sanitized.others).toHaveLength(1)
    expect(sanitized.hotels).toHaveLength(1)
    expect(sanitized.shoppings).toHaveLength(1)
    expect(sanitized.options).toHaveLength(1)
    expect(sanitized.companyExpenses).toEqual([])
    expect(assertAdminCompanyExpenseSaveAllowed(existing, sanitized.companyExpenses)).toEqual({
      ok: false,
      error: ADMIN_COMPANY_EXPENSE_HYDRATION_SAVE_ERROR,
    })
    expect(buildCompanyExpenseDbRows(sanitized.companyExpenses, existing.id)).toEqual([])
  })

  it('server guard allows legitimate company expense update and does not preserve stale rows in payload', () => {
    const existing: SettlementFull = {
      ...mockSubmittedSettlement(),
      company_expenses: [
        {
          id: 'ce1',
          settlement_id: 'settlement-1',
          description: 'Old deposit',
          amount_usd: 10,
          amount_vnd: 0,
          note: null,
          sort_order: 0,
          created_at: '',
          updated_at: '',
        },
      ],
    }
    const state = stateFromSettlementFull(existing, 'Admin')
    state.companyExpenses = [
      {
        ...emptyCompanyExpenseRow(),
        id: 'ce1',
        description: 'Updated deposit',
        amount_usd: 99,
        amount_vnd: 0,
      },
    ]

    const sanitized = sanitizeAdminDraftPayload(toDraftPayload(state), existing)
    expect(assertAdminCompanyExpenseSaveAllowed(existing, sanitized.companyExpenses)).toEqual({
      ok: true,
    })
    expect(sanitized.companyExpenses).toHaveLength(1)
    expect(sanitized.companyExpenses[0].description).toBe('Updated deposit')
    expect(sanitized.companyExpenses[0].amount_usd).toBe(99)
  })

  it('server guard allows settlements with no company expenses', () => {
    const existing = mockSubmittedSettlement()
    const state = stateFromSettlementFull(existing, 'Admin')
    const sanitized = sanitizeAdminDraftPayload(toDraftPayload(state), existing)
    expect(assertAdminCompanyExpenseSaveAllowed(existing, sanitized.companyExpenses)).toEqual({
      ok: true,
    })
    expect(sanitized.companyExpenses).toEqual([])
  })

  it('guide-owned line items remain preserved when admin payload is empty (independent of company guard)', () => {
    const existing: SettlementFull = {
      ...mockSubmittedSettlement(),
      meals: [
        {
          id: 'm1',
          settlement_id: 'settlement-1',
          meal_date: null,
          restaurant_name: 'R1',
          pax: 10,
          unit_price_vnd: 0,
          amount_vnd: 100000,
          sort_order: 0,
          created_at: '',
          updated_at: '',
        },
      ],
      company_expenses: [
        {
          id: 'ce1',
          settlement_id: 'settlement-1',
          description: 'Co exp',
          amount_usd: 10,
          amount_vnd: 0,
          note: null,
          sort_order: 0,
          created_at: '',
          updated_at: '',
        },
      ],
    }
    const emptyUi = {
      ...emptyFormState('Admin'),
      settlementId: existing.id,
      tourId: existing.tour_id,
    }
    const sanitized = sanitizeAdminDraftPayload(toDraftPayload(emptyUi), existing)
    expect(sanitized.meals).toHaveLength(1)
    expect(assertAdminCompanyExpenseSaveAllowed(existing, sanitized.companyExpenses).ok).toBe(false)
  })
})

describe('guide confirmation diff visibility', () => {
  it('hides ground_fee_usd, vehicle fee, KB, and company profit from guide-visible changes', () => {
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

    const allChanges = diffSnapshotPayloads(before, after)
    const visible = filterGuideConfirmationChanges(allChanges)

    expect(visible.some((c) => c.field_path === 'header.ground_fee_usd')).toBe(false)
    expect(visible.some((c) => c.field_path.includes('kb_usd'))).toBe(false)
    expect(visible.some((c) => c.field_path === 'calc_summary.company_grand_total_usd')).toBe(false)
    // Vehicle fee is an admin/company internal cost — hidden from the guide list,
    // but still present in the raw diff so admin/master visibility is unchanged.
    expect(visible.some((c) => c.field_path === 'header.vehicle_fee_usd')).toBe(false)
    expect(allChanges.some((c) => c.field_path === 'header.vehicle_fee_usd')).toBe(true)
  })
})
