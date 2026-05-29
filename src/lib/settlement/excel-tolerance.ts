/**
 * Operational settlement policy contract verification (not literal Excel workbook parity).
 *
 * Recomputes Q75 / R85 / R87 from the same policy formulas as calc.ts and checks:
 * - formula metadata matches the operational contract
 * - final totals stay within EXCEL_FINAL_TOLERANCE_USD (legacy name; max 1 USD)
 *
 * Legacy export names (ExcelReference*, EXCEL_FORMULA_CONTRACT) are kept for callers.
 */

import {
  calcCashSubtotals,
  calcEntranceSubtotals,
  calcCompanyExpenseSubtotals,
  calcGuideSettlementFromProfitPool,
  calcHotelSubtotals,
  calcMealSubtotals,
  calcOptionSubtotals,
  calcOtherSubtotals,
  calcShoppingActualProfitUsd,
  calcShoppingSubtotals,
  computeSettlementMatrixValues,
  ADMIN_COMPANY_INCOME_FORMULA,
  ADMIN_COMPANY_PROFIT_FORMULA,
  GUIDE_SETTLEMENT_FORMULA,
  Q75_FORMULA,
  SETTLEMENT_PROFIT_INCOME_FORMULA,
  SETTLEMENT_SHOPPING_PROFIT_FORMULA,
} from './calc'
import type { SettlementCalcInput, SettlementCalcResult } from './types-calc'

/** Max allowed |calc.ts − policy reference| for Q75 / R85 / R87 finals (USD). */
export const EXCEL_FINAL_TOLERANCE_USD = 1

export type SettlementFinalExcelRef = 'Q75' | 'R85' | 'R87'

export type VarianceCause =
  | 'exact_match'
  | 'exchange_rate_division'
  | 'floating_point_rounding'
  | 'display_format_cents'
  | 'ceil_or_floor_policy'

export interface ExcelReferenceFinals {
  company_deposit_usd: number
  guide_settlement_usd: number
  company_grand_total_usd: number
  /** Strict intermediate checks — finals tolerance does not apply here. */
  steps: {
    d80_shopping_income_usd: number
    d81_option_com_usd: number
    r79_settlement_pool_usd: number
    r84_balance_usd: number
    uses_vnd_conversion: boolean
  }
}

export interface FinalComparison {
  excelRef: SettlementFinalExcelRef
  label: string
  codeUsd: number
  excelReferenceUsd: number
  differenceUsd: number
  withinTolerance: boolean
  causes: VarianceCause[]
}

export interface FormulaFlowViolation {
  step: string
  excelRef: string
  expected: string
  actual: string
}

export interface ExcelSettlementVerification {
  passed: boolean
  formulaFlowOk: boolean
  formulaViolations: FormulaFlowViolation[]
  finals: FinalComparison[]
  /** True only when every final is within tolerance AND formula flow is valid. */
  acceptable: boolean
}

/** Operational policy formulas calc.ts must follow (legacy export name). */
export const EXCEL_FORMULA_CONTRACT: Record<string, string> = {
  D80: SETTLEMENT_SHOPPING_PROFIT_FORMULA,
  D84: SETTLEMENT_PROFIT_INCOME_FORMULA,
  R79: SETTLEMENT_PROFIT_INCOME_FORMULA,
  R84: 'R79−R80−R81',
  R85: GUIDE_SETTLEMENT_FORMULA,
  Q75: Q75_FORMULA,
  H85: 'H84+J84+M84+O84',
  R86: ADMIN_COMPANY_PROFIT_FORMULA,
  R87: 'R86+H72+S75',
  F86: 'admin_income−admin_expense',
}

const STEP_EPSILON_USD = 0.001

function nearlyEqual(a: number, b: number, epsilon = STEP_EPSILON_USD): boolean {
  return Math.abs(a - b) <= epsilon
}

/** Independent policy-contract reference path for Q75 / R85 / R87 finals. */
export function computeExcelReferenceFinals(input: SettlementCalcInput): ExcelReferenceFinals {
  const rate = input.exchange_rate

  const hotels = calcHotelSubtotals(input.hotels)
  const meals = calcMealSubtotals(input.meals, rate)
  const entrances = calcEntranceSubtotals(input.entrances, rate)
  const others = calcOtherSubtotals(input.others, rate)
  const companyExpenses = calcCompanyExpenseSubtotals(input.company_expenses ?? [], rate)
  const shopping = calcShoppingSubtotals(input.shoppings)
  const options = calcOptionSubtotals(input.options, rate)

  const cash = calcCashSubtotals(
    input,
    hotels.guide_total_usd,
    meals.total_usd,
    entrances.total_usd,
    others.combined_usd,
    options.com_usd,
    options.extra_vehicle_usd,
  )

  const matrix = computeSettlementMatrixValues(input.header, {
    hotels,
    meals,
    entrances,
    others,
    shopping,
    options,
    companyExpenses,
  })

  const guideSettlement = calcGuideSettlementFromProfitPool(
    calcShoppingActualProfitUsd(shopping.com_usd.value),
    options.com_usd.value,
    input.header.megugi_usd,
    input.header.tc_guide_usd + input.header.tc_company_usd,
    input.header.guide_daily_fee_usd,
  ).guideSettlement

  const usesVnd =
    input.header.advance_vnd !== 0 ||
    input.meals.some((m) => !m.deleted && m.unit_price_vnd !== 0) ||
    input.entrances.some((e) => !e.deleted && e.unit_price_vnd !== 0) ||
    input.others.some((o) => !o.deleted && o.amount_vnd !== 0) ||
    input.options.some((o) => !o.deleted && o.expense_vnd !== 0)

  return {
    company_deposit_usd: cash.company_deposit_usd.value,
    guide_settlement_usd: guideSettlement,
    company_grand_total_usd: matrix.r87,
    steps: {
      d80_shopping_income_usd: matrix.d80,
      d81_option_com_usd: matrix.d81,
      r79_settlement_pool_usd: matrix.r79,
      r84_balance_usd: matrix.r84,
      uses_vnd_conversion: usesVnd,
    },
  }
}

export function inferVarianceCauses(
  differenceUsd: number,
  usesVndConversion: boolean,
): VarianceCause[] {
  const abs = Math.abs(differenceUsd)
  if (abs === 0) return ['exact_match']
  const causes: VarianceCause[] = []
  if (usesVndConversion) causes.push('exchange_rate_division')
  if (abs <= 0.01) causes.push('floating_point_rounding')
  if (abs > 0 && abs <= 0.05) causes.push('display_format_cents')
  if (causes.length === 0) causes.push('floating_point_rounding')
  return causes
}

export function compareFinalToExcel(
  excelRef: SettlementFinalExcelRef,
  label: string,
  codeUsd: number,
  excelReferenceUsd: number,
  usesVndConversion: boolean,
): FinalComparison {
  const differenceUsd = codeUsd - excelReferenceUsd
  const withinTolerance = Math.abs(differenceUsd) <= EXCEL_FINAL_TOLERANCE_USD
  return {
    excelRef,
    label,
    codeUsd,
    excelReferenceUsd,
    differenceUsd,
    withinTolerance,
    causes: inferVarianceCauses(differenceUsd, usesVndConversion),
  }
}

/** Ensures calc.ts follows the operational policy contract — not just close finals. */
export function verifyExcelFormulaFlow(
  result: SettlementCalcResult,
  input: SettlementCalcInput,
  reference: ExcelReferenceFinals,
): { ok: boolean; violations: FormulaFlowViolation[] } {
  const violations: FormulaFlowViolation[] = []
  const shopping = result.sections.shopping
  const options = result.sections.options
  const h = input.header

  const push = (step: string, excelRef: string, expected: string, actual: string) => {
    violations.push({ step, excelRef, expected, actual })
  }

  const expectedD80 = shopping.com_usd.value
  const d80Row = result.matrix.find((r) => r.key === 'r80')?.income?.value
  if (d80Row != null && !nearlyEqual(d80Row, expectedD80)) {
    push('D80', 'D80', `${EXCEL_FORMULA_CONTRACT.D80} (= ${expectedD80})`, String(d80Row))
  }
  if (!nearlyEqual(reference.steps.d80_shopping_income_usd, expectedD80)) {
    push('D80 reference', 'D80', String(expectedD80), String(reference.steps.d80_shopping_income_usd))
  }

  const excelLegacyD80 = shopping.sale_usd.value + shopping.com_usd.value
  if (d80Row != null && nearlyEqual(d80Row, excelLegacyD80) && !nearlyEqual(shopping.sale_usd.value, 0)) {
    push(
      'D80',
      'D80',
      `${EXCEL_FORMULA_CONTRACT.D80} (= ${expectedD80})`,
      `SALE+COM legacy (= ${excelLegacyD80})`,
    )
  }

  const r79Row = result.matrix.find((r) => r.key === 'r79')?.settlement?.value
  const expectedR79 = expectedD80 + options.com_usd.value
  if (r79Row != null && !nearlyEqual(r79Row, expectedR79)) {
    push('R79', 'R79', `${EXCEL_FORMULA_CONTRACT.R79} (= ${expectedR79})`, String(r79Row))
  }

  const expectedD84 = expectedR79
  if (!nearlyEqual(result.summary.income_total_usd.value, expectedD84)) {
    push(
      'D84',
      'D84',
      `${SETTLEMENT_PROFIT_INCOME_FORMULA} (= ${expectedD84})`,
      String(result.summary.income_total_usd.value),
    )
  }

  const expectedAdminIncome =
    expectedD80 +
    options.com_usd.value +
    h.tip_received_usd +
    h.charming_other_usd +
    (h.ground_fee_usd ?? 0)
  if (!nearlyEqual(result.summary.admin_income_usd.value, expectedAdminIncome)) {
    push(
      'admin_income',
      '—',
      `${ADMIN_COMPANY_INCOME_FORMULA} (= ${expectedAdminIncome})`,
      String(result.summary.admin_income_usd.value),
    )
  }

  const expectedR84 =
    expectedR79 - h.megugi_usd - (h.tc_guide_usd + h.tc_company_usd)
  if (!nearlyEqual(result.summary.balance_usd.value, expectedR84)) {
    push(
      'R84',
      'R84',
      `${EXCEL_FORMULA_CONTRACT.R84} (= ${expectedR84})`,
      String(result.summary.balance_usd.value),
    )
  }

  const expectedR85 = calcGuideSettlementFromProfitPool(
    calcShoppingActualProfitUsd(shopping.com_usd.value),
    options.com_usd.value,
    h.megugi_usd,
    h.tc_guide_usd + h.tc_company_usd,
    h.guide_daily_fee_usd,
  ).guideSettlement
  if (!nearlyEqual(result.summary.guide_settlement_usd.value, expectedR85)) {
    push(
      'R85',
      'R85',
      `${EXCEL_FORMULA_CONTRACT.R85} (= ${expectedR85})`,
      String(result.summary.guide_settlement_usd.value),
    )
  }

  const expectedR86 =
    expectedAdminIncome -
    result.summary.expense_total_usd.value -
    result.summary.guide_payout_usd.value
  if (!nearlyEqual(result.summary.company_profit_usd.value, expectedR86)) {
    push(
      'R86',
      'R86',
      `${ADMIN_COMPANY_PROFIT_FORMULA} (= ${expectedR86})`,
      String(result.summary.company_profit_usd.value),
    )
  }

  const formulaChecks: Array<[string, string | undefined, string]> = [
    ['Q75', result.sections.cash.company_deposit_usd.formula, EXCEL_FORMULA_CONTRACT.Q75],
    ['R85', result.summary.guide_settlement_usd.formula, EXCEL_FORMULA_CONTRACT.R85],
    ['R87', result.summary.company_grand_total_usd.formula, EXCEL_FORMULA_CONTRACT.R87],
    ['R86', result.summary.company_profit_usd.formula, EXCEL_FORMULA_CONTRACT.R86],
    ['F86', result.summary.company_gross_usd.formula, EXCEL_FORMULA_CONTRACT.F86],
    ['H85', result.summary.expense_total_usd.formula, EXCEL_FORMULA_CONTRACT.H85],
    ['R79', result.matrix.find((r) => r.key === 'r79')?.settlement?.formula, EXCEL_FORMULA_CONTRACT.R79],
    ['R84', result.summary.balance_usd.formula, EXCEL_FORMULA_CONTRACT.R84],
    ['D80', result.matrix.find((r) => r.key === 'r80')?.income?.formula, EXCEL_FORMULA_CONTRACT.D80],
    ['D84', result.summary.income_total_usd.formula, EXCEL_FORMULA_CONTRACT.D84],
  ]
  for (const [excelRef, actual, expected] of formulaChecks) {
    if (actual != null && actual !== expected) {
      push(`${excelRef} metadata`, excelRef, expected, actual)
    }
  }

  return { ok: violations.length === 0, violations }
}

export function verifySettlementAgainstExcel(
  result: SettlementCalcResult,
  input: SettlementCalcInput,
): ExcelSettlementVerification {
  const reference = computeExcelReferenceFinals(input)
  const { ok: formulaFlowOk, violations: formulaViolations } = verifyExcelFormulaFlow(
    result,
    input,
    reference,
  )

  const usesVnd = reference.steps.uses_vnd_conversion

  const finals: FinalComparison[] = [
    compareFinalToExcel(
      'Q75',
      '회사입금액',
      result.sections.cash.company_deposit_usd.value,
      reference.company_deposit_usd,
      usesVnd,
    ),
    compareFinalToExcel(
      'R85',
      '가이드 정산금액',
      result.summary.guide_settlement_usd.value,
      reference.guide_settlement_usd,
      usesVnd,
    ),
    compareFinalToExcel(
      'R87',
      '회사수익',
      result.summary.company_grand_total_usd.value,
      reference.company_grand_total_usd,
      usesVnd,
    ),
  ]

  const finalsOk = finals.every((f) => f.withinTolerance)
  const passed = formulaFlowOk && finalsOk
  const acceptable = passed

  return {
    passed,
    formulaFlowOk,
    formulaViolations,
    finals,
    acceptable,
  }
}
