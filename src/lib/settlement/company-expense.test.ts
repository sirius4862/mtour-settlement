import { describe, expect, it } from 'vitest'
import {
  buildCompanyExpenseDbRows,
  sanitizeAdminDraftPayload,
  stateFromSettlementFull,
  toCalcInput,
  toDraftPayload,
} from './mappers'
import { emptyCompanyExpenseRow } from './defaults'
import {
  calcCompanyExpenseRowCombinedUsd,
  calcCompanyExpenseSubtotals,
  calcSettlement,
} from './calc'
import {
  buildSnapshotPayload,
  diffSnapshotPayloads,
  filterGuideConfirmationChanges,
  isGuideHiddenConfirmChange,
  sanitizeSettlementFullForGuide,
  stripCompanyExpensesFromGuideSnapshotPayload,
} from './snapshot'
import { MOCK_SETTLEMENT_INPUT } from './mock-data'
import type { SettlementFull } from '@/types'

const RATE = 26000

function settlementWithCompanyExpenses(
  rows: { description: string; amount_usd: number; amount_vnd: number; note?: string | null }[],
): SettlementFull {
  const base = MOCK_SETTLEMENT_INPUT
  return {
    id: 'settlement-ce',
    tour_id: 'tour-1',
    guide_id: 'guide-1',
    branch_id: 'branch-1',
    status: 'submitted',
    year_month: '2025-11',
    exchange_rate: base.exchange_rate,
    advance_vnd: base.header.advance_vnd,
    tour_fee_usd: 0,
    ground_fee_usd: base.header.ground_fee_usd,
    charming_other_usd: base.header.charming_other_usd,
    tip_received_usd: base.header.tip_received_usd,
    option_receivable_usd: 0,
    tip_transfer_usd: 0,
    option_credit_usd: 0,
    vehicle_fee_usd: base.header.vehicle_fee_usd,
    head_tax_usd: base.header.head_tax_usd,
    seoul_biz_fee_usd: base.header.seoul_biz_fee_usd,
    tc_guide_usd: base.header.tc_guide_usd,
    tc_company_usd: base.header.tc_company_usd,
    megugi_usd: base.header.megugi_usd,
    guide_daily_fee_usd: base.header.guide_daily_fee_usd,
    settlement_ratio: base.header.settlement_ratio,
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
    company_expenses: rows.map((row, i) => ({
      id: `ce-${i}`,
      settlement_id: 'settlement-ce',
      description: row.description,
      amount_usd: row.amount_usd,
      amount_vnd: row.amount_vnd,
      note: row.note ?? null,
      sort_order: i,
      created_at: '',
      updated_at: '',
    })),
  }
}

describe('company expense row math', () => {
  it('combines USD + VND/Q2', () => {
    expect(calcCompanyExpenseRowCombinedUsd({ amount_usd: 10, amount_vnd: 26_000 }, RATE)).toBeCloseTo(
      11,
      6,
    )
  })

  it('sums active rows in subtotals', () => {
    const sub = calcCompanyExpenseSubtotals(
      [
        { amount_usd: 100, amount_vnd: 0 },
        { amount_usd: 0, amount_vnd: 52_000, deleted: true },
        { amount_usd: 5, amount_vnd: 26_000 },
      ],
      RATE,
    )
    expect(sub.combined_usd.value).toBeCloseTo(106, 6)
  })
})

describe('company expense settlement policy', () => {
  const baselineInput = {
    ...MOCK_SETTLEMENT_INPUT,
    company_expenses: [],
  }

  it('reduces R87 without changing Q75, R85, or guide payout', () => {
    const baseline = calcSettlement(baselineInput)
    const withRows = calcSettlement({
      ...baselineInput,
      company_expenses: [
        { amount_usd: 50, amount_vnd: 26_000 },
        { amount_usd: 20, amount_vnd: 0 },
      ],
    })

    expect(withRows.sections.cash.company_deposit_usd.value).toBeCloseTo(
      baseline.sections.cash.company_deposit_usd.value,
      6,
    )
    expect(withRows.summary.guide_settlement_usd.value).toBe(
      baseline.summary.guide_settlement_usd.value,
    )
    expect(withRows.summary.guide_payout_usd.value).toBe(baseline.summary.guide_payout_usd.value)
    expect(withRows.sections.others.combined_usd.value).toBeCloseTo(
      baseline.sections.others.combined_usd.value,
      6,
    )
    expect(withRows.summary.company_grand_total_usd.value).toBeLessThan(
      baseline.summary.company_grand_total_usd.value,
    )
    expect(
      baseline.summary.company_grand_total_usd.value -
        withRows.summary.company_grand_total_usd.value,
    ).toBeCloseTo(71, 6)
  })
})

describe('company expense persistence', () => {
  it('buildCompanyExpenseDbRows maps draft rows for admin save', () => {
    const rows = buildCompanyExpenseDbRows(
      [
        {
          ...emptyCompanyExpenseRow(),
          description: 'Hotel deposit',
          amount_usd: 200,
          amount_vnd: 0,
          note: 'prepaid',
        },
      ],
      'settlement-1',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      settlement_id: 'settlement-1',
      description: 'Hotel deposit',
      amount_usd: 200,
      amount_vnd: 0,
      note: 'prepaid',
      sort_order: 0,
    })
  })

  it('admin sanitize passes through incoming company expense rows', () => {
    const existing = settlementWithCompanyExpenses([])
    const state = stateFromSettlementFull(existing, 'Admin')
    state.companyExpenses.push({
      ...emptyCompanyExpenseRow(),
      description: 'Ticket prepayment',
      amount_usd: 75,
      amount_vnd: 0,
    })

    const sanitized = sanitizeAdminDraftPayload(toDraftPayload(state), existing)
    expect(sanitized.companyExpenses).toHaveLength(1)
    expect(sanitized.companyExpenses[0].description).toBe('Ticket prepayment')
  })
})

describe('company expense guide visibility', () => {
  it('sanitizeSettlementFullForGuide strips company_expenses', () => {
    const full = settlementWithCompanyExpenses([{ description: 'Hidden', amount_usd: 10, amount_vnd: 0 }])
    const sanitized = sanitizeSettlementFullForGuide(full)
    expect(sanitized.company_expenses).toEqual([])
  })

  it('sanitizeSettlementFullForGuide zeros admin-only header fields', () => {
    const full = settlementWithCompanyExpenses([])
    full.ground_fee_usd = 400
    full.vehicle_fee_usd = 80
    full.head_tax_usd = 20
    full.seoul_biz_fee_usd = 10
    full.calc_summary_json = {
      company_deposit_usd: 500,
      guide_settlement_usd: 300,
      guide_payout_usd: 300,
      company_grand_total_usd: -150,
    }

    const sanitized = sanitizeSettlementFullForGuide(full)
    expect(sanitized.ground_fee_usd).toBe(0)
    expect(sanitized.vehicle_fee_usd).toBe(0)
    expect(sanitized.head_tax_usd).toBe(0)
    expect(sanitized.seoul_biz_fee_usd).toBe(0)
    expect(sanitized.calc_summary_json).not.toHaveProperty('company_grand_total_usd')
  })

  it('stripCompanyExpensesFromGuideSnapshotPayload clears rows', () => {
    const full = settlementWithCompanyExpenses([{ description: 'Hidden', amount_usd: 10, amount_vnd: 0 }])
    const payload = buildSnapshotPayload(full)
    expect(payload.company_expenses).toHaveLength(1)
    const stripped = stripCompanyExpensesFromGuideSnapshotPayload(payload)
    expect(stripped.company_expenses).toEqual([])
  })

  it('isGuideHiddenConfirmChange hides company_expenses field paths', () => {
    expect(
      isGuideHiddenConfirmChange({ field_path: 'company_expenses.ce-1.amount_usd' }),
    ).toBe(true)
  })

  it('company expense changes are not in confirm diff loops today', () => {
    const before = buildSnapshotPayload(settlementWithCompanyExpenses([]))
    const after = buildSnapshotPayload(
      settlementWithCompanyExpenses([{ description: 'Deposit', amount_usd: 99, amount_vnd: 0 }]),
    )
    const visible = filterGuideConfirmationChanges(diffSnapshotPayloads(before, after))
    expect(visible.some((c) => c.field_path.startsWith('company_expenses.'))).toBe(false)
  })
})

describe('toCalcInput includes company expenses separately from guide others', () => {
  it('maps companyExpenses into calc input', () => {
    const full = settlementWithCompanyExpenses([{ description: 'X', amount_usd: 30, amount_vnd: 0 }])
    const input = toCalcInput(stateFromSettlementFull(full, ''))
    expect(input.company_expenses).toEqual([{ amount_usd: 30, amount_vnd: 0, deleted: undefined }])
    expect(input.others).toEqual([])
  })
})
