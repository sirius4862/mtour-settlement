import { describe, expect, it } from 'vitest'
import { calcSettlement } from './calc'
import {
  EXCEL_FINAL_TOLERANCE_USD,
  compareFinalToExcel,
  computeExcelReferenceFinals,
  inferVarianceCauses,
  verifyExcelFormulaFlow,
  verifySettlementAgainstExcel,
} from './excel-tolerance'
import type { SettlementCalcInput } from './types-calc'
import { MOCK_SETTLEMENT_INPUT } from './mock-data'

const RATE = 26000

function emptyInput(overrides: Partial<SettlementCalcInput> = {}): SettlementCalcInput {
  return {
    exchange_rate: RATE,
    header: {
      advance_vnd: 0,
      charming_other_usd: 0,
      tip_received_usd: 0,
      option_receivable_usd: 0,
      tip_transfer_usd: 0,
      ground_fee_usd: 0,
      vehicle_fee_usd: 0,
      head_tax_usd: 0,
      seoul_biz_fee_usd: 0,
      tc_guide_usd: 0,
      tc_company_usd: 0,
      megugi_usd: 0,
      guide_daily_fee_usd: 0,
      settlement_ratio: 0.5,
    },
    hotels: [],
    meals: [],
    entrances: [],
    others: [],
    shoppings: [],
    options: [],
    ...overrides,
  }
}

describe('EXCEL_FINAL_TOLERANCE_USD', () => {
  it('is 1 USD', () => {
    expect(EXCEL_FINAL_TOLERANCE_USD).toBe(1)
  })
})

describe('inferVarianceCauses', () => {
  it('records exact_match when difference is zero', () => {
    expect(inferVarianceCauses(0, false)).toEqual(['exact_match'])
  })

  it('records exchange_rate_division when VND is in the chain', () => {
    const causes = inferVarianceCauses(0.38, true)
    expect(causes).toContain('exchange_rate_division')
  })

  it('records floating_point_rounding for tiny differences', () => {
    expect(inferVarianceCauses(0.004, false)).toContain('floating_point_rounding')
  })
})

describe('compareFinalToExcel', () => {
  it('allows differences up to 1 USD inclusive', () => {
    expect(compareFinalToExcel('R85', '가이드 정산금액', 100.5, 100, false).withinTolerance).toBe(
      true,
    )
    expect(compareFinalToExcel('R85', '가이드 정산금액', 101.01, 100, false).withinTolerance).toBe(
      false,
    )
  })

  it('still records causes when within tolerance', () => {
    const cmp = compareFinalToExcel('Q75', '회사입금액', 79.62, 79.615384615, true)
    expect(cmp.withinTolerance).toBe(true)
    expect(cmp.causes.length).toBeGreaterThan(0)
    expect(cmp.causes).not.toEqual(['exact_match'])
  })
})

describe('verifySettlementAgainstExcel — MOCK golden', () => {
  it('passes formula flow and final tolerance for MOCK_SETTLEMENT_INPUT', () => {
    const result = calcSettlement(MOCK_SETTLEMENT_INPUT)
    const verification = verifySettlementAgainstExcel(result, MOCK_SETTLEMENT_INPUT)

    expect(verification.formulaFlowOk).toBe(true)
    expect(verification.formulaViolations).toHaveLength(0)
    expect(verification.acceptable).toBe(true)

    const q75 = verification.finals.find((f) => f.excelRef === 'Q75')!
    const r85 = verification.finals.find((f) => f.excelRef === 'R85')!
    const r87 = verification.finals.find((f) => f.excelRef === 'R87')!

    expect(q75.withinTolerance).toBe(true)
    expect(r85.withinTolerance).toBe(true)
    expect(r87.withinTolerance).toBe(true)
    expect(r85.differenceUsd).toBe(0)
    expect(Math.abs(q75.differenceUsd)).toBeLessThanOrEqual(EXCEL_FINAL_TOLERANCE_USD)
    expect(Math.abs(r87.differenceUsd)).toBeLessThanOrEqual(EXCEL_FINAL_TOLERANCE_USD)
  })

  it('reference finals match known Excel expectations for mock', () => {
    const ref = computeExcelReferenceFinals(MOCK_SETTLEMENT_INPUT)
    expect(ref.guide_settlement_usd).toBe(168.5)
    expect(ref.company_deposit_usd).toBeCloseTo(79.615384615, 4)
    expect(ref.company_grand_total_usd).toBeCloseTo(-438.884615384, 4)
  })
})

describe('verifySettlementAgainstExcel — formula direction guard', () => {
  it('fails when D80 reference uses SALE+COM legacy instead of COM-only', () => {
    const input = emptyInput({
      header: {
        ...emptyInput().header,
        megugi_usd: 0,
        tc_guide_usd: 0,
        tc_company_usd: 0,
        guide_daily_fee_usd: 0,
        settlement_ratio: 0.5,
      },
      shoppings: [{ sale_usd: 100, com_usd: 20, kb_usd: 0 }],
      options: [{ unit_price_usd: 10, pax: 5, expense_usd: 5, expense_vnd: 0 }],
    })

    const result = calcSettlement(input)
    const reference = computeExcelReferenceFinals(input)

    const wrongReference: typeof reference = {
      ...reference,
      steps: {
        ...reference.steps,
        d80_shopping_income_usd: 120,
        r79_settlement_pool_usd: 120 + reference.steps.d81_option_com_usd,
        r84_balance_usd: 120 + reference.steps.d81_option_com_usd,
      },
    }

    const flow = verifyExcelFormulaFlow(result, input, wrongReference)
    expect(flow.ok).toBe(false)
    expect(flow.violations.some((v) => v.step.includes('D80'))).toBe(true)
  })

  it('does not accept > 1 USD final gap as passing', () => {
    const cmp = compareFinalToExcel('R85', '가이드 정산금액', 170, 168.5, false)
    expect(cmp.withinTolerance).toBe(false)
    expect(Math.abs(cmp.differenceUsd)).toBeGreaterThan(EXCEL_FINAL_TOLERANCE_USD)
  })
})

describe('verifySettlementAgainstExcel — VND rounding path', () => {
  it('accepts ≤1 USD gap on Q75 when meals use VND/Q2', () => {
    const input = emptyInput({
      header: { ...emptyInput().header, advance_vnd: 5_200_000 },
      meals: [{ pax: 18, unit_price_vnd: 85000 }],
    })
    const result = calcSettlement(input)
    const verification = verifySettlementAgainstExcel(result, input)
    const q75 = verification.finals.find((f) => f.excelRef === 'Q75')!
    expect(q75.withinTolerance).toBe(true)
    if (q75.differenceUsd !== 0) {
      expect(q75.causes).toContain('exchange_rate_division')
    }
  })
})
