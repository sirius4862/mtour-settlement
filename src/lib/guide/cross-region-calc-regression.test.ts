/**
 * Regression: cross-region guide assignment must not affect settlement calculations.
 * calcSettlement uses SettlementCalcInput only (line items + header fees) — no guide_id / profile.branch_id.
 */
import { describe, expect, it } from 'vitest'
import { calcSettlement } from '@/lib/settlement/calc'
import type { SettlementCalcInput } from '@/lib/settlement/types-calc'
import { canAdminAccessRegion, resolveAdminRegionFilter } from '@/lib/region/permissions'
import {
  filterAdminToursByRegionScope,
  isGuideAssignedToTour,
  resolveSettlementOperatingBranchId,
} from './assignment'

const DANANG = 'region-danang'
const NHATRANG = 'region-nhatrang'

const RATE = 26_000

/** Representative settlement financial payload (tour operating region is not a calc input). */
function settlementFinancialInput(): SettlementCalcInput {
  return {
    exchange_rate: RATE,
    header: {
      advance_vnd: 26_000_000,
      charming_other_usd: 50,
      tip_received_usd: 30,
      option_receivable_usd: 0,
      tip_transfer_usd: 0,
      ground_fee_usd: 200,
      vehicle_fee_usd: 120,
      head_tax_usd: 40,
      seoul_biz_fee_usd: 25,
      tc_guide_usd: 10,
      tc_company_usd: 5,
      megugi_usd: 15,
      guide_daily_fee_usd: 35,
      settlement_ratio: 0.5,
    },
    hotels: [],
    meals: [],
    entrances: [],
    others: [],
    company_expenses: [{ amount_usd: 30, amount_vnd: 0, deleted: false }],
    shoppings: [{ sale_usd: 800, com_usd: 320, kb_usd: 18, deleted: false }],
    options: [
      { unit_price_usd: 50, pax: 2, expense_usd: 10, expense_vnd: 0, deleted: false },
    ],
  }
}

function calcProfitSnapshot(result: ReturnType<typeof calcSettlement>) {
  return {
    company_grand_total_usd: result.summary.company_grand_total_usd.value,
    company_profit_usd: result.summary.company_profit_usd.value,
    guide_payout_usd: result.summary.guide_payout_usd.value,
    guide_settlement_usd: result.summary.guide_settlement_usd.value,
    admin_income_usd: result.summary.admin_income_usd.value,
    expense_total_usd: result.summary.expense_total_usd.value,
    company_deposit_usd: result.sections.cash.company_deposit_usd.value,
  }
}

describe('cross-region assignment — calc isolation', () => {
  it('SettlementCalcInput has no guide_id or profile branch_id fields', () => {
    const input = settlementFinancialInput()
    expect(Object.keys(input)).not.toContain('guide_id')
    expect(Object.keys(input)).not.toContain('branch_id')
    expect(Object.keys(input.header)).not.toContain('branch_id')
    expect(Object.keys(input.header)).not.toContain('guide_id')
  })

  it('identical settlement numbers yield identical company profit after cross-region guide assignment', () => {
    const financial = settlementFinancialInput()

    const danangHomeGuide = { profileBranchId: DANANG, guideId: 'guide-a' }
    const nhatrangHomeGuide = { profileBranchId: NHATRANG, guideId: 'guide-b' }

    const beforeAssign = calcProfitSnapshot(calcSettlement(financial))
    const afterCrossRegionAssign = calcProfitSnapshot(calcSettlement(financial))

    expect(afterCrossRegionAssign).toEqual(beforeAssign)
    expect(danangHomeGuide.profileBranchId).not.toBe(nhatrangHomeGuide.profileBranchId)
  })

  it('guide payout does not change based on guide profile branch_id', () => {
    const financial = settlementFinancialInput()
    const payoutA = calcSettlement(financial).summary.guide_payout_usd.value
    const payoutB = calcSettlement(financial).summary.guide_payout_usd.value
    expect(payoutA).toBe(payoutB)
    expect(payoutA).toBeGreaterThan(0)
  })

  it('company profit does not change based on guide profile branch_id', () => {
    const financial = settlementFinancialInput()
    const r87A = calcSettlement(financial).summary.company_grand_total_usd.value
    const r87B = calcSettlement(financial).summary.company_grand_total_usd.value
    const r86A = calcSettlement(financial).summary.company_profit_usd.value
    const r86B = calcSettlement(financial).summary.company_profit_usd.value
    expect(r87A).toBe(r87B)
    expect(r86A).toBe(r86B)
  })

  it('operating branch for persistence comes from tour only, not guide home branch', () => {
    const tour = { guide_id: 'guide-nhatrang', branch_id: DANANG }
    expect(
      resolveSettlementOperatingBranchId(tour, 'guide-nhatrang'),
    ).toEqual({ ok: true, branchId: DANANG })
    expect(NHATRANG).not.toBe(tour.branch_id)
  })
})

describe('cross-region assignment — access rules unchanged', () => {
  const danangAdmin = { role: 'admin' as const, assignedRegionId: DANANG }

  it('admin region scoping follows settlement.branch_id not guide home branch', () => {
    const settlementInDanang = { branch_id: DANANG, guide_id: 'guide-nhatrang' }
    const settlementInNhatrang = { branch_id: NHATRANG, guide_id: 'guide-danang' }

    expect(canAdminAccessRegion(danangAdmin, settlementInDanang.branch_id)).toBe(true)
    expect(canAdminAccessRegion(danangAdmin, settlementInNhatrang.branch_id)).toBe(false)

    expect(resolveAdminRegionFilter(danangAdmin)).toBe(DANANG)
    expect(resolveAdminRegionFilter(danangAdmin, NHATRANG)).toBe(DANANG)
  })

  it('admin tour list scope uses tour.branch_id operating region', () => {
    const visible = filterAdminToursByRegionScope(
      [
        { id: 't-d', branch_id: DANANG },
        { id: 't-n', branch_id: NHATRANG },
      ],
      danangAdmin,
    )
    expect(visible.map((t) => t.id)).toEqual(['t-d'])
  })

  it('guide access follows assigned guide_id only', () => {
    const tour = { guide_id: 'guide-nhatrang', branch_id: DANANG }
    expect(isGuideAssignedToTour(tour, 'guide-nhatrang')).toBe(true)
    expect(isGuideAssignedToTour(tour, 'guide-danang')).toBe(false)
    expect(isGuideAssignedToTour(tour, 'guide-nhatrang')).toBe(true)
  })
})
