import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MOCK_SETTLEMENT_INPUT } from './mock-data'
import {
  buildSnapshotPayload,
  diffSnapshotPayloads,
  filterGuideConfirmationChanges,
  isGuideHiddenConfirmChange,
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

describe('guide confirm packet policy', () => {
  it('excludes company_grand_total_usd / R87 from diffSnapshotPayloads', () => {
    const before = buildSnapshotPayload(minimalSettlementFull())
    const after = buildSnapshotPayload(
      minimalSettlementFull({
        vehicle_fee_usd: before.header.vehicle_fee_usd as number + 50,
      }),
    )

    const changes = diffSnapshotPayloads(before, after)

    expect(changes.some((c) => c.field_path === 'calc_summary.company_grand_total_usd')).toBe(false)
    expect(changes.some((c) => c.excel_ref === 'R87')).toBe(false)
    expect(changes.some((c) => c.label === '회사수익')).toBe(false)
    expect(changes.some((c) => c.field_path === 'header.vehicle_fee_usd')).toBe(true)
  })

  it('guide packet summary uses deposit and payout only (no R87 fields)', () => {
    const before = buildSnapshotPayload(minimalSettlementFull())
    const after = buildSnapshotPayload(
      minimalSettlementFull({ megugi_usd: (before.header.megugi_usd as number) + 5 }),
    )

    const packetSummary = {
      companyDepositBefore: before.calc_summary.company_deposit_usd,
      companyDepositAfter: after.calc_summary.company_deposit_usd,
      guidePayoutBefore: before.calc_summary.guide_payout_usd,
      guidePayoutAfter: after.calc_summary.guide_payout_usd,
    }

    expect(packetSummary).not.toHaveProperty('r87Before')
    expect(packetSummary).not.toHaveProperty('r87After')
    expect(packetSummary).not.toHaveProperty('company_grand_total_usd')
    expect(typeof packetSummary.companyDepositBefore).toBe('number')
    expect(typeof packetSummary.guidePayoutAfter).toBe('number')
  })

  it('C: filterGuideConfirmationChanges hides shopping KB changes', () => {
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
      minimalSettlementFull({ shoppings: [{ ...shop, kb_usd: 15 }] }),
    )
    const allChanges = diffSnapshotPayloads(before, after)
    expect(allChanges.some((c) => c.field_path === 'shoppings.shop-1.kb_usd')).toBe(true)
    const visible = filterGuideConfirmationChanges(allChanges)
    expect(visible.some((c) => c.field_path.includes('kb_usd'))).toBe(false)
    expect(isGuideHiddenConfirmChange(allChanges.find((c) => c.field_path.includes('kb_usd'))!)).toBe(true)
  })

  it('filterGuideConfirmationChanges removes legacy R87 rows', () => {
    const legacy = [
      {
        field_path: 'calc_summary.company_grand_total_usd',
        excel_ref: 'R87',
        label: '회사수익',
      },
      {
        field_path: 'header.megugi_usd',
        excel_ref: 'R80',
        label: '메꾸기',
      },
    ]

    expect(isGuideHiddenConfirmChange(legacy[0])).toBe(true)
    expect(filterGuideConfirmationChanges(legacy)).toEqual([legacy[1]])
  })
})

describe('H-guide: admin/company cost fields hidden from guide confirmation diff', () => {
  it('hides 차량비 (vehicle fee) from the guide list but keeps it in the raw diff for admin', () => {
    const before = buildSnapshotPayload(minimalSettlementFull({ vehicle_fee_usd: 25 }))
    const after = buildSnapshotPayload(minimalSettlementFull({ vehicle_fee_usd: 125 }))

    const allChanges = diffSnapshotPayloads(before, after)
    // Admin/master visibility (raw diff) retains the field.
    expect(allChanges.some((c) => c.field_path === 'header.vehicle_fee_usd')).toBe(true)

    const visible = filterGuideConfirmationChanges(allChanges)
    expect(visible.some((c) => c.field_path === 'header.vehicle_fee_usd')).toBe(false)
    expect(visible.some((c) => c.label === '차량비')).toBe(false)
  })

  it('hides 인두세 (head tax) from the guide list but keeps it in the raw diff for admin', () => {
    const before = buildSnapshotPayload(minimalSettlementFull({ head_tax_usd: 8 }))
    const after = buildSnapshotPayload(minimalSettlementFull({ head_tax_usd: 80 }))

    const allChanges = diffSnapshotPayloads(before, after)
    expect(allChanges.some((c) => c.field_path === 'header.head_tax_usd')).toBe(true)

    const visible = filterGuideConfirmationChanges(allChanges)
    expect(visible.some((c) => c.field_path === 'header.head_tax_usd')).toBe(false)
    expect(visible.some((c) => c.label === '인두세')).toBe(false)
  })

  it('hides 서울영업비 (Seoul business fee) from the guide list but keeps it in the raw diff for admin', () => {
    const before = buildSnapshotPayload(minimalSettlementFull({ seoul_biz_fee_usd: 5 }))
    const after = buildSnapshotPayload(minimalSettlementFull({ seoul_biz_fee_usd: 55 }))

    const allChanges = diffSnapshotPayloads(before, after)
    expect(allChanges.some((c) => c.field_path === 'header.seoul_biz_fee_usd')).toBe(true)

    const visible = filterGuideConfirmationChanges(allChanges)
    expect(visible.some((c) => c.field_path === 'header.seoul_biz_fee_usd')).toBe(false)
    expect(visible.some((c) => c.label === '서울영업비')).toBe(false)
  })

  it('keeps T/C settlement-related changes visible to the guide', () => {
    const before = buildSnapshotPayload(minimalSettlementFull({ tc_company_usd: 8 }))
    const after = buildSnapshotPayload(minimalSettlementFull({ tc_company_usd: 48 }))

    const visible = filterGuideConfirmationChanges(diffSnapshotPayloads(before, after))
    expect(visible.some((c) => c.field_path === 'header.tc_company_usd')).toBe(true)

    // Direct field-level guard for TC fields (guide income impact).
    expect(isGuideHiddenConfirmChange({ field_path: 'header.tc_company_usd', label: 'T/C 회사분' })).toBe(false)
    expect(isGuideHiddenConfirmChange({ field_path: 'header.tc_guide_usd', label: 'T/C 가이드분' })).toBe(false)
  })

  it('keeps calculated and final guide settlement amounts visible to the guide', () => {
    const calculated = { field_path: 'calc_summary.guide_settlement_usd', excel_ref: 'R85', label: '계산상 가이드 정산금액' }
    const finalPayout = { field_path: 'calc_summary.guide_payout_usd', excel_ref: 'P85', label: '가이드 정산금액' }

    expect(isGuideHiddenConfirmChange(calculated)).toBe(false)
    expect(isGuideHiddenConfirmChange(finalPayout)).toBe(false)
    expect(filterGuideConfirmationChanges([calculated, finalPayout])).toEqual([calculated, finalPayout])
  })

  it('admin/master raw diff retains all three cost fields together (no reduced visibility)', () => {
    const before = buildSnapshotPayload(
      minimalSettlementFull({ vehicle_fee_usd: 10, head_tax_usd: 2, seoul_biz_fee_usd: 1 }),
    )
    const after = buildSnapshotPayload(
      minimalSettlementFull({ vehicle_fee_usd: 90, head_tax_usd: 20, seoul_biz_fee_usd: 10 }),
    )

    const allChanges = diffSnapshotPayloads(before, after)
    expect(allChanges.some((c) => c.field_path === 'header.vehicle_fee_usd')).toBe(true)
    expect(allChanges.some((c) => c.field_path === 'header.head_tax_usd')).toBe(true)
    expect(allChanges.some((c) => c.field_path === 'header.seoul_biz_fee_usd')).toBe(true)
  })
})

describe('guide confirm page source', () => {
  it('does not render 회사수익 or R87 summary labels', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/guide/settlements/[id]/confirm/page.tsx'),
      'utf8',
    )

    expect(source).not.toContain('회사수익')
    expect(source).not.toContain('r87Before')
    expect(source).not.toContain('r87After')
    expect(source).toContain('GUIDE_FOOTER_LABELS.companyDeposit')
    expect(source).toContain('GUIDE_FOOTER_LABELS.guideSettlement')
  })

  it('redirects to detail when confirmation packet is unavailable', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/guide/settlements/[id]/confirm/page.tsx'),
      'utf8',
    )

    expect(source).toContain('redirect(`/guide/settlements/${id}`)')
    expect(source).not.toMatch(/status !== 'pending_guide_confirmation'[\s\S]*notFound\(\)/)
  })

  it('ConfirmPanel navigates without refresh after success', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/guide/settlements/[id]/confirm/ConfirmPanel.tsx'),
      'utf8',
    )

    expect(source).toContain('router.push(`/guide/settlements/${settlementId}`)')
    expect(source).not.toContain('router.refresh()')
  })
})
