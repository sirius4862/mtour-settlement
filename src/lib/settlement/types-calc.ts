/**
 * Pure calculation types — no React, no DB clients.
 * Maps to Excel sheet "정산서양식" (Q2 = exchange rate).
 */

/** Soft-deleted rows are excluded from all totals. */
export interface SoftDeletable {
  deleted?: boolean
}

export interface HotelCalcRow extends SoftDeletable {
  sgl_count: number
  twn_count: number
  trp_count: number
  nights: number
  unit_price_sgl_usd: number
  unit_price_trp_usd: number
  /** Excel R column — manual guide hotel payment */
  guide_amount_usd: number
}

export interface MealCalcRow extends SoftDeletable {
  pax: number
  unit_price_vnd: number
}

export interface EntranceCalcRow extends SoftDeletable {
  pax: number
  unit_price_vnd: number
}

export interface OtherExpenseCalcRow extends SoftDeletable {
  days: number | null
  pax: number
  unit_price_usd: number
  unit_price_vnd: number
  /** When true, USD amount uses days × pax × unit (Excel rows 41–43) */
  use_days_for_usd?: boolean
}

export interface ShoppingCalcRow extends SoftDeletable {
  sale_usd: number
  com_usd: number
  kb_usd: number
}

export interface OptionCalcRow extends SoftDeletable {
  unit_price_usd: number
  pax: number
  expense_usd: number
  expense_vnd: number
  is_extra_vehicle?: boolean
}

export interface SettlementHeaderCalc {
  /** A76 — advance VND */
  advance_vnd: number
  /** D75 — charming / other sales */
  charming_other_usd: number
  /** F75 — tip received */
  tip_received_usd: number
  /** P75 — option credit / tip remittance */
  option_credit_usd: number
  /** D79 — tour fee */
  tour_fee_usd: number
  /** O79 — vehicle fee (included) */
  vehicle_fee_usd: number
  /** O80 — head tax */
  head_tax_usd: number
  /** O81 — Seoul business fee */
  seoul_biz_fee_usd: number
  /** H83 — T/C guide share */
  tc_guide_usd: number
  /** J83 — T/C company share */
  tc_company_usd: number
  /** R80 — megugi adjustment */
  megugi_usd: number
  /** R82 — guide daily fee */
  guide_daily_fee_usd: number
  /** R77 — settlement ratio (0–1) */
  settlement_ratio: number
}

export interface SettlementCalcInput {
  /** Q2 — VND per 1 USD */
  exchange_rate: number
  header: SettlementHeaderCalc
  hotels: HotelCalcRow[]
  meals: MealCalcRow[]
  entrances: EntranceCalcRow[]
  others: OtherExpenseCalcRow[]
  shoppings: ShoppingCalcRow[]
  options: OptionCalcRow[]
}

/** Excel-equivalent label + formula source for UI display */
export interface AnnotatedNumber {
  value: number
  label: string
  excelRef: string
  formula: string
}

export interface HotelRowCalc {
  company_amount_usd: AnnotatedNumber
  guide_amount_usd: AnnotatedNumber
}

export interface SectionSubtotals {
  hotels: {
    company_total_usd: AnnotatedNumber
    guide_total_usd: AnnotatedNumber
  }
  meals: {
    total_vnd: AnnotatedNumber
    total_usd: AnnotatedNumber
  }
  entrances: {
    total_vnd: AnnotatedNumber
    total_usd: AnnotatedNumber
  }
  others: {
    total_usd: AnnotatedNumber
    total_vnd: AnnotatedNumber
    combined_usd: AnnotatedNumber
  }
  shopping: {
    sale_usd: AnnotatedNumber
    com_usd: AnnotatedNumber
    kb_usd: AnnotatedNumber
  }
  options: {
    total_sale_usd: AnnotatedNumber
    expense_usd: AnnotatedNumber
    expense_vnd_usd: AnnotatedNumber
    com_usd: AnnotatedNumber
    extra_vehicle_usd: AnnotatedNumber
  }
  cash: {
    advance_usd: AnnotatedNumber
    option_revenue_usd: AnnotatedNumber
    extra_vehicle_usd: AnnotatedNumber
    income_total_usd: AnnotatedNumber
    guide_expense_deposit_usd: AnnotatedNumber
    company_deposit_usd: AnnotatedNumber
  }
}

/** One visual row in the Excel R79–R87 matrix */
export interface SettlementMatrixRow {
  key: string
  incomeLabel?: string
  income?: AnnotatedNumber
  expenseLabel?: string
  guideExpense?: AnnotatedNumber
  companyExpense?: AnnotatedNumber
  includedLabel?: string
  included?: AnnotatedNumber
  settlementLabel?: string
  settlement?: AnnotatedNumber
  isSubtotal?: boolean
  isHighlight?: boolean
}

export interface SettlementCalcResult {
  sections: SectionSubtotals
  matrix: SettlementMatrixRow[]
  summary: {
    income_total_usd: AnnotatedNumber
    expense_total_usd: AnnotatedNumber
    company_gross_usd: AnnotatedNumber
    balance_usd: AnnotatedNumber
    guide_settlement_usd: AnnotatedNumber
    company_profit_usd: AnnotatedNumber
    company_grand_total_usd: AnnotatedNumber
  }
}
