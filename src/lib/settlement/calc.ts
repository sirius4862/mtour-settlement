/**
 * Excel "정산서양식" calculation engine — pure functions only.
 * Source of truth: docs/2025년 11월 정산서 양식(26,000동).xlsx
 *
 * No UI, no I/O, no side effects. All totals exclude soft-deleted rows.
 */

import type {
  AnnotatedNumber,
  EntranceCalcRow,
  HotelCalcRow,
  MealCalcRow,
  OptionCalcRow,
  OtherExpenseCalcRow,
  SettlementCalcInput,
  SettlementCalcResult,
  SettlementMatrixRow,
  ShoppingCalcRow,
  SoftDeletable,
} from './types-calc'
import { resolveOptionCreditUsd } from './external-receivable'

// ── Primitives ───────────────────────────────────────────────────

export function activeRows<T extends SoftDeletable>(rows: T[]): T[] {
  return rows.filter((r) => !r.deleted)
}

/** Q2 conversion — J25, J38, J52, etc. */
export function vndToUsd(vnd: number, exchangeRate: number): number {
  if (exchangeRate === 0) return 0
  return vnd / exchangeRate
}

export function annotate(
  value: number,
  label: string,
  excelRef: string,
  formula: string,
): AnnotatedNumber {
  return { value, label, excelRef, formula }
}

function sum(nums: number[]): number {
  return nums.reduce((a, n) => a + n, 0)
}

// ── Row-level (Excel row formulas) ───────────────────────────────

/** P8: (F8+H8)*E8*M8 + J8*E8*O8 */
export function calcHotelCompanyUsd(row: HotelCalcRow): number {
  const sglTwn = row.sgl_count + row.twn_count
  return sglTwn * row.nights * row.unit_price_sgl_usd
    + row.trp_count * row.nights * row.unit_price_trp_usd
}

export function calcHotelRow(row: HotelCalcRow): {
  company_amount_usd: AnnotatedNumber
  guide_amount_usd: AnnotatedNumber
} {
  const company = calcHotelCompanyUsd(row)
  return {
    company_amount_usd: annotate(
      company,
      '회사결재($)',
      'P8',
      '(SGL+TWN)×N×단가(SGL/TWN) + TRP×N×단가(TRP)',
    ),
    guide_amount_usd: annotate(
      row.guide_amount_usd,
      '가이드결재($)',
      'R8',
      '수동 입력',
    ),
  }
}

/** H15: E15×F15 */
export function calcMealAmountVnd(row: MealCalcRow): number {
  return row.pax * row.unit_price_vnd
}

/** H28: E28×F28 */
export function calcEntranceAmountVnd(row: EntranceCalcRow): number {
  return row.pax * row.unit_price_vnd
}

/** H41: D41×E41×F41  |  H44+: E44×F44 */
export function calcOtherAmountUsd(row: OtherExpenseCalcRow): number {
  if (row.use_days_for_usd && row.days != null) {
    return row.days * row.pax * row.unit_price_usd
  }
  return row.pax * row.unit_price_usd
}

/** R41: O41×P41 */
export function calcOtherAmountVnd(row: OtherExpenseCalcRow): number {
  return row.pax * row.unit_price_vnd
}

/** O57: M57×N57 */
export function calcOptionTotalSaleUsd(row: OptionCalcRow): number {
  return row.unit_price_usd * row.pax
}

/** S57: O57−P57−Q57/Q2 (per-row COM) */
export function calcOptionRowComUsd(row: OptionCalcRow, exchangeRate: number): number {
  const totalSale = calcOptionTotalSaleUsd(row)
  return totalSale - row.expense_usd - vndToUsd(row.expense_vnd, exchangeRate)
}

/** S75 row: P71+(Q71/Q2) for extra vehicle only */
export function calcExtraVehicleUsd(row: OptionCalcRow, exchangeRate: number): number {
  if (!row.is_extra_vehicle) return 0
  return row.expense_usd + vndToUsd(row.expense_vnd, exchangeRate)
}

// ── Section subtotals ────────────────────────────────────────────

export function calcHotelSubtotals(hotels: HotelCalcRow[]) {
  const rows = activeRows(hotels)
  const company = sum(rows.map(calcHotelCompanyUsd))
  const guide = sum(rows.map((r) => r.guide_amount_usd))
  return {
    company_total_usd: annotate(company, '회사 호텔 합', 'P11', 'SUM(P8:Q10)'),
    guide_total_usd: annotate(guide, '가이드 호텔 합', 'R11', 'SUM(R8:S10)'),
  }
}

export function calcMealSubtotals(meals: MealCalcRow[], exchangeRate: number) {
  const rows = activeRows(meals)
  const totalVnd = sum(rows.map(calcMealAmountVnd))
  const totalUsd = vndToUsd(totalVnd, exchangeRate)
  return {
    total_vnd: annotate(totalVnd, '식사비 합(VND)', 'J24', 'SUM(H15:H23,R15:R23)'),
    total_usd: annotate(totalUsd, '식사비(USD 환산)', 'J25', 'J24/Q2'),
  }
}

export function calcEntranceSubtotals(entrances: EntranceCalcRow[], exchangeRate: number) {
  const rows = activeRows(entrances)
  const totalVnd = sum(rows.map(calcEntranceAmountVnd))
  const totalUsd = vndToUsd(totalVnd, exchangeRate)
  return {
    total_vnd: annotate(totalVnd, '입장료 합(VND)', 'J37', 'SUM(H28:H36,R28:R36)'),
    total_usd: annotate(totalUsd, '입장료(USD 환산)', 'J38', 'J37/Q2'),
  }
}

export function calcOtherSubtotals(others: OtherExpenseCalcRow[], exchangeRate: number) {
  const rows = activeRows(others)
  const totalUsd = sum(rows.map(calcOtherAmountUsd))
  const totalVnd = sum(rows.map(calcOtherAmountVnd))
  const vndAsUsd = vndToUsd(totalVnd, exchangeRate)
  const combined = totalUsd + vndAsUsd
  return {
    total_usd: annotate(totalUsd, '기타지출($)', 'H52', 'SUM(H41:I51)'),
    total_vnd: annotate(totalVnd, '기타지출(₫)', 'R52', 'SUM(R41:S51)'),
    combined_usd: annotate(combined, '기타지출(USD 환산)', 'J53', 'H52 + R52/Q2'),
  }
}

export function calcShoppingSubtotals(shoppings: ShoppingCalcRow[]) {
  const rows = activeRows(shoppings)
  return {
    sale_usd: annotate(sum(rows.map((r) => r.sale_usd)), 'SALE 합', 'D72', 'SUM(D57:E71)'),
    com_usd: annotate(sum(rows.map((r) => r.com_usd)), 'COM 합', 'F72', 'SUM(F57:G71)'),
    kb_usd: annotate(sum(rows.map((r) => r.kb_usd)), 'KB (회사 전용 수익) 합', 'H72', 'SUM(H57:I71)'),
  }
}

export function calcOptionSubtotals(options: OptionCalcRow[], exchangeRate: number) {
  const rows = activeRows(options)
  const regular = rows.filter((r) => !r.is_extra_vehicle)
  const extraRows = rows.filter((r) => r.is_extra_vehicle)

  const totalSale = sum(regular.map(calcOptionTotalSaleUsd))
  const expenseUsd = sum(regular.map((r) => r.expense_usd))
  const expenseVnd = sum(regular.map((r) => r.expense_vnd))
  const expenseVndUsd = vndToUsd(expenseVnd, exchangeRate)

  /** S72: O72−Q72−P72 (Excel total-row formula, differs from per-row S57) */
  const comTotal = totalSale - expenseVndUsd - expenseUsd

  const extraVehicle = sum(extraRows.map((r) => calcExtraVehicleUsd(r, exchangeRate)))

  return {
    total_sale_usd: annotate(totalSale, '옵션 판매총액', 'O72', 'SUM(O57:O71)'),
    expense_usd: annotate(expenseUsd, '옵션 지출($)', 'P72', 'SUM(P57:P71)'),
    expense_vnd_usd: annotate(expenseVndUsd, '옵션 지출(₫→$)', 'Q72', 'SUM(Q57:R71)/Q2'),
    com_usd: annotate(comTotal, '옵션 COM 합', 'S72', 'O72−Q72−P72'),
    extra_vehicle_usd: annotate(extraVehicle, '추가차량비', 'S75', 'P71+(Q71/Q2)'),
  }
}

/**
 * Excel legacy: D72+SUM(F72) — reference only; not used for settlement profit (see calcShoppingActualProfitUsd).
 */
export function calcShoppingIncomeD80(d72SaleUsd: number, f72ComUsd: number): number {
  return d72SaleUsd + f72ComUsd
}

/**
 * Excel O84/M84 = SUM(O79:O83) — vehicle, head tax, seoul biz fee.
 */
export function calcIncludedSubtotalO84(
  vehicleFeeUsd: number,
  headTaxUsd: number,
  seoulBizFeeUsd: number,
): number {
  return vehicleFeeUsd + headTaxUsd + seoulBizFeeUsd
}

/**
 * Excel H85 = H84+J84+M84+O84.
 * M84 uses the same SUM(O79:O83) as O84; in the operational sheet M84 is blank, so O84 is counted once.
 */
export function calcExpenseTotalH85(h84: number, j84: number, o84: number): number {
  const m84 = 0
  return h84 + j84 + m84 + o84
}

export interface SettlementMatrixValues {
  d80: number
  d81: number
  d82: number
  d83: number
  d84: number
  h79: number
  h80: number
  h81: number
  h82: number
  h83: number
  h84: number
  j79: number
  j83: number
  j84: number
  o79: number
  o80: number
  o81: number
  o84: number
  m84: number
  h85: number
  r79: number
  r80: number
  r81: number
  r84: number
  r85: number
  guidePayout: number
  adminIncome: number
  adminExpense: number
  f86: number
  r86: number
  r87: number
}

/** Fixed guide profit share — operational policy (not Excel R77 slider). */
export const GUIDE_PROFIT_SHARE_RATIO = 0.5

export const GUIDE_SETTLEMENT_FORMULA = 'MAX((F72+D81−R80)×50%,0)+R82'

/** Operational settlement D80 — shopping COM (F72) only; SALE (D72) excluded from profit pool. */
export const SETTLEMENT_SHOPPING_PROFIT_FORMULA = 'SUM(F72)'

/** Operational D84 / R79 — shopping COM + option COM only (excludes tour fee, tips, SALE). */
export const SETTLEMENT_PROFIT_INCOME_FORMULA = 'D80+D81'

/** Admin company revenue — includes ground_fee (투어피/지상비); excludes shopping SALE. */
export const ADMIN_COMPANY_INCOME_FORMULA = 'F72+D81+F75+D75+ground_fee'

/** Admin company profit before KB/extra vehicle. */
export const ADMIN_COMPANY_PROFIT_FORMULA = 'admin_income−admin_expense−P85'

/** Cash reconciliation — advance (A76) remains in J75; no tour/ground fee deduction. */
export const Q75_FORMULA = 'J75−N75−P75'

/** Shopping profit for guide settlement — COM (F72) only, not D80 (SALE+COM). */
export function calcShoppingActualProfitUsd(comUsd: number): number {
  return comUsd
}

export function calcGuideSettlementFromProfitPool(
  shoppingActualProfitUsd: number,
  optionActualProfitUsd: number,
  megugiUsd: number,
  guideDailyFeeUsd: number,
  profitShareRatio = GUIDE_PROFIT_SHARE_RATIO,
): {
  actualProfitPool: number
  guideProfitShare: number
  guideSettlement: number
  guidePayout: number
} {
  const actualProfitPool = shoppingActualProfitUsd + optionActualProfitUsd - megugiUsd
  const guideProfitShare = Math.max(actualProfitPool * profitShareRatio, 0)
  const guideSettlement = guideProfitShare + guideDailyFeeUsd
  const guidePayout = Math.max(guideSettlement, 0)
  return { actualProfitPool, guideProfitShare, guideSettlement, guidePayout }
}

/** Excel R79–R87 matrix — shared by calcSettlement and verification. */
export function computeSettlementMatrixValues(
  header: SettlementCalcInput['header'],
  sections: {
    hotels: ReturnType<typeof calcHotelSubtotals>
    meals: ReturnType<typeof calcMealSubtotals>
    entrances: ReturnType<typeof calcEntranceSubtotals>
    others: ReturnType<typeof calcOtherSubtotals>
    shopping: ReturnType<typeof calcShoppingSubtotals>
    options: ReturnType<typeof calcOptionSubtotals>
  },
): SettlementMatrixValues {
  const h = header
  const d72 = sections.shopping.sale_usd.value
  const f72 = sections.shopping.com_usd.value
  const d80 = calcShoppingActualProfitUsd(f72)
  const d81 = sections.options.com_usd.value
  const d82 = h.tip_received_usd
  const d83 = h.charming_other_usd
  /** Settlement profit income — COM + option COM; excludes tips/charming/SALE. */
  const d84 = d80 + d81

  const h79 = sections.hotels.guide_total_usd.value
  const h80 = sections.meals.total_usd.value
  const h81 = sections.entrances.total_usd.value
  const h82 = sections.others.combined_usd.value
  const h83 = h.tc_guide_usd
  const h84 = h79 + h80 + h81 + h82 + h83

  const j79 = sections.hotels.company_total_usd.value
  const j83 = h.tc_company_usd
  const j84 = j79 + j83

  const o79 = h.vehicle_fee_usd
  const o80 = h.head_tax_usd
  const o81 = h.seoul_biz_fee_usd
  const o84 = calcIncludedSubtotalO84(o79, o80, o81)
  const m84 = 0
  const h85 = calcExpenseTotalH85(h84, j84, o84)

  const r79 = d80 + d81
  const r80 = h.megugi_usd
  const r81 = h83 + j83
  const r84 = r79 - r80 - r81
  const { guideSettlement: r85, guidePayout } = calcGuideSettlementFromProfitPool(
    calcShoppingActualProfitUsd(f72),
    d81,
    r80,
    h.guide_daily_fee_usd,
  )

  const adminIncome =
    d80 + d81 + d82 + d83 + (h.ground_fee_usd ?? 0)
  const adminExpense = h85
  const f86 = adminIncome - adminExpense
  const r86 = adminIncome - adminExpense - guidePayout
  const r87 = r86 + sections.shopping.kb_usd.value + sections.options.extra_vehicle_usd.value

  return {
    d80,
    d81,
    d82,
    d83,
    d84,
    h79,
    h80,
    h81,
    h82,
    h83,
    h84,
    j79,
    j83,
    j84,
    o79,
    o80,
    o81,
    o84,
    m84,
    h85,
    r79,
    r80,
    r81,
    r84,
    r85,
    guidePayout,
    adminIncome,
    adminExpense,
    f86,
    r86,
    r87,
  }
}

export function calcCashSubtotals(
  input: SettlementCalcInput,
  hotelGuide: AnnotatedNumber,
  mealsUsd: AnnotatedNumber,
  entrancesUsd: AnnotatedNumber,
  othersCombined: AnnotatedNumber,
  optionCom: AnnotatedNumber,
  extraVehicle: AnnotatedNumber,
) {
  const { header, exchange_rate } = input
  const advanceUsd = vndToUsd(header.advance_vnd, exchange_rate)
  const optionRevenue = optionCom.value
  const incomeTotal =
    advanceUsd +
    header.charming_other_usd +
    header.tip_received_usd +
    optionRevenue +
    extraVehicle.value

  const guideDeposit =
    hotelGuide.value +
    mealsUsd.value +
    entrancesUsd.value +
    othersCombined.value +
    header.tc_guide_usd

  const optionCredit = resolveOptionCreditUsd(header)
  const companyDeposit = incomeTotal - guideDeposit - optionCredit

  return {
    advance_usd: annotate(advanceUsd, '전도금(USD)', 'A75', 'A76/Q2'),
    option_revenue_usd: annotate(optionRevenue, '옵션수익', 'H75', 'S72'),
    extra_vehicle_usd: annotate(extraVehicle.value, '추가차량비', 'S75', 'P71+(Q71/Q2)'),
    income_total_usd: annotate(incomeTotal, '합계', 'J75', 'A75+D75+F75+H75+S75'),
    guide_expense_deposit_usd: annotate(
      guideDeposit,
      '가이드지출금',
      'N75',
      'R11+J25+J38+J53+H83',
    ),
    option_receivable_usd: annotate(
      header.option_receivable_usd ?? 0,
      '옵션외상',
      '—',
      '회사 계좌 입금',
    ),
    tip_transfer_usd: annotate(
      header.tip_transfer_usd ?? 0,
      '팁송금',
      '—',
      '회사 계좌 입금',
    ),
    option_credit_usd: annotate(
      optionCredit,
      '옵션외상/팁송금 합',
      'P75',
      'option_receivable_usd + tip_transfer_usd',
    ),
    company_deposit_usd: annotate(
      companyDeposit,
      '회사입금액',
      'Q75',
      Q75_FORMULA,
    ),
  }
}

// ── Settlement matrix R79–R87 ────────────────────────────────────

export function calcSettlement(input: SettlementCalcInput): SettlementCalcResult {
  const rate = input.exchange_rate
  const h = input.header

  const hotels = calcHotelSubtotals(input.hotels)
  const meals = calcMealSubtotals(input.meals, rate)
  const entrances = calcEntranceSubtotals(input.entrances, rate)
  const others = calcOtherSubtotals(input.others, rate)
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

  const m = computeSettlementMatrixValues(h, {
    hotels,
    meals,
    entrances,
    others,
    shopping,
    options,
  })
  const {
    d80,
    d81,
    d82,
    d83,
    d84,
    h79,
    h80,
    h81,
    h82,
    h83,
    h84,
    j79,
    j83,
    j84,
    o79,
    o80,
    o81,
    o84,
    h85,
    r79,
    r80,
    r81,
    r84,
    r85,
    guidePayout,
    adminIncome,
    adminExpense,
    f86,
    r86,
    r87,
  } = m

  const matrix: SettlementMatrixRow[] = [
    {
      key: 'r79',
      expenseLabel: '호텔비',
      guideExpense: annotate(h79, '호텔비(가이드)', 'H79', 'R11'),
      companyExpense: annotate(j79, '호텔비(회사)', 'J79', 'P11'),
      includedLabel: '차량비',
      included: annotate(o79, '차량비', 'O79', '수동 입력'),
      settlementLabel: '쇼핑COM+옵션COM',
      settlement: annotate(r79, '정산 수익풀', 'R79', SETTLEMENT_PROFIT_INCOME_FORMULA),
    },
    {
      key: 'r80',
      incomeLabel: '쇼핑수익(COM)',
      income: annotate(d80, '쇼핑수익(COM)', 'D80', SETTLEMENT_SHOPPING_PROFIT_FORMULA),
      expenseLabel: '식사비',
      guideExpense: annotate(h80, '식사비', 'H80', 'J25'),
      settlementLabel: '메꾸기',
      settlement: annotate(r80, '메꾸기', 'R80', '수동 입력'),
    },
    {
      key: 'r81',
      incomeLabel: '옵션수익',
      income: annotate(d81, '옵션수익', 'D81', 'S72'),
      expenseLabel: '입장료',
      guideExpense: annotate(h81, '입장료', 'H81', 'J38'),
      includedLabel: '서울영업비',
      included: annotate(o81, '서울영업비', 'O81', '수동 입력'),
      settlementLabel: 'T/C정산공제',
      settlement: annotate(r81, 'T/C정산공제', 'R81', 'H83+J83'),
    },
    {
      key: 'r82',
      incomeLabel: '받은팁',
      income: annotate(d82, '받은팁', 'D82', 'F75'),
      expenseLabel: '기타지출',
      guideExpense: annotate(h82, '기타지출', 'H82', 'J53'),
      includedLabel: '인두세',
      included: annotate(o80, '인두세', 'O80', '수동 입력'),
      settlementLabel: '가이드 일비',
      settlement: annotate(h.guide_daily_fee_usd, '가이드 일비', 'R82', '수동 입력'),
    },
    {
      key: 'r83',
      incomeLabel: '추가수익',
      income: annotate(d83, '추가수익', 'D83', 'D75'),
      expenseLabel: 'T/C정산',
      guideExpense: annotate(h83, 'T/C정산(가이드)', 'H83', '수동 입력'),
      companyExpense: annotate(j83, 'T/C정산(회사)', 'J83', '수동 입력'),
    },
    {
      key: 'r84',
      incomeLabel: '합계',
      income: annotate(d84, '정산 수익합계', 'D84', SETTLEMENT_PROFIT_INCOME_FORMULA),
      expenseLabel: '합계',
      guideExpense: annotate(h84, '가이드지출 합', 'H84', 'SUM(H79:I83)'),
      companyExpense: annotate(j84, '회사지출 합', 'J84', 'SUM(J79:L83)'),
      included: annotate(o84, '회사지출 합', 'O84', 'SUM(O79:O83)'),
      settlementLabel: '차액(밸런스)',
      settlement: annotate(r84, '차액(밸런스)', 'R84', 'R79−R80−R81'),
      isSubtotal: true,
    },
    {
      key: 'r85',
      expenseLabel: '지출 총액',
      guideExpense: annotate(h85, '지출 총액', 'H85', 'H84+J84+M84+O84'),
      settlementLabel: '가이드정산',
      settlement: annotate(r85, '가이드정산', 'R85', GUIDE_SETTLEMENT_FORMULA),
      isSubtotal: true,
      isHighlight: true,
    },
    {
      key: 'r86',
      incomeLabel: '회사수익합계',
      income: annotate(adminIncome, '회사 수익', '—', ADMIN_COMPANY_INCOME_FORMULA),
      expenseLabel: '회사지출합계',
      guideExpense: annotate(adminExpense, '회사 지출', 'H85', 'H84+J84+O84'),
      settlementLabel: '회사수익(R86)',
      settlement: annotate(r86, '회사수익', 'R86', ADMIN_COMPANY_PROFIT_FORMULA),
      isSubtotal: true,
    },
    {
      key: 'r87',
      settlementLabel: '회사수익',
      settlement: annotate(r87, '회사수익', 'R87', 'R86+H72+S75'),
      isSubtotal: true,
      isHighlight: true,
    },
  ]

  return {
    sections: { hotels, meals, entrances, others, shopping, options, cash },
    matrix,
    summary: {
      income_total_usd: annotate(d84, '가이드 수익풀', 'D84', SETTLEMENT_PROFIT_INCOME_FORMULA),
      admin_income_usd: annotate(adminIncome, '회사 수익 합계', '—', ADMIN_COMPANY_INCOME_FORMULA),
      expense_total_usd: annotate(adminExpense, '회사 지출 총액', 'H85', 'H84+J84+M84+O84'),
      company_gross_usd: annotate(f86, '수익−지출', 'F86', 'admin_income−admin_expense'),
      balance_usd: annotate(r84, '차액(밸런스)', 'R84', 'R79−R80−R81'),
      guide_settlement_usd: annotate(r85, '가이드정산', 'R85', GUIDE_SETTLEMENT_FORMULA),
      guide_payout_usd: annotate(guidePayout, '실제 지급액', 'P85', 'MAX(R85,0)'),
      company_profit_usd: annotate(r86, '회사수익(R86)', 'R86', ADMIN_COMPANY_PROFIT_FORMULA),
      company_grand_total_usd: annotate(r87, '회사수익', 'R87', 'R86+H72+S75'),
    },
  }
}

/** Convenience: full recalc from any partial input (live form updates). */
export function recalcSettlement(partial: SettlementCalcInput): SettlementCalcResult {
  return calcSettlement(partial)
}
