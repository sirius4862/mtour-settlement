import type {
  DraftCompanyExpenseRow,
  DraftEntranceRow,
  DraftHotelRow,
  DraftMealRow,
  DraftOptionRow,
  DraftOtherRow,
  DraftShoppingRow,
  SettlementFormHeader,
} from './form-types'
import type { SettlementDraftPayload } from './mappers'

export type ServerPayloadValidationResult =
  | { ok: true }
  | { ok: false; error: string }

function isFiniteMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function moneyError(label: string): ServerPayloadValidationResult {
  return { ok: false, error: `${label} 값이 올바르지 않습니다.` }
}

function checkMoney(value: unknown, label: string): ServerPayloadValidationResult | null {
  if (!isFiniteMoney(value)) return moneyError(label)
  return null
}

function validateHeaderNumbers(header: SettlementFormHeader): ServerPayloadValidationResult | null {
  const fields: [unknown, string][] = [
    [header.advance_vnd, '전도금'],
    [header.charming_other_usd, '기타매출'],
    [header.tip_received_usd, '팁'],
    [header.option_receivable_usd, '옵션외상'],
    [header.tip_transfer_usd, '팁송금'],
    [header.ground_fee_usd, '지상비'],
    [header.vehicle_fee_usd, '차량비'],
    [header.head_tax_usd, '인두세'],
    [header.seoul_biz_fee_usd, '서울영업비'],
    [header.tc_guide_usd, 'T/C 가이드'],
    [header.tc_company_usd, 'T/C 회사'],
    [header.megugi_usd, '메구기'],
    [header.guide_daily_fee_usd, '가이드 일비'],
    [header.settlement_ratio, '정산비율'],
  ]
  if (header.option_credit_usd !== undefined) {
    fields.push([header.option_credit_usd, '옵션외상(합계)'])
  }
  for (const [value, label] of fields) {
    const err = checkMoney(value, label)
    if (err) return err
  }
  return null
}

function validateHotels(rows: DraftHotelRow[]): ServerPayloadValidationResult | null {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const n = i + 1
    for (const [value, label] of [
      [r.nights, `호텔 #${n} 박수`],
      [r.sgl_count, `호텔 #${n} SGL`],
      [r.twn_count, `호텔 #${n} TWN`],
      [r.trp_count, `호텔 #${n} TRP`],
      [r.unit_price_sgl_usd, `호텔 #${n} SGL 단가`],
      [r.unit_price_trp_usd, `호텔 #${n} TRP 단가`],
      [r.guide_amount_usd, `호텔 #${n} 가이드 금액`],
    ] as const) {
      const err = checkMoney(value, label)
      if (err) return err
    }
  }
  return null
}

function validateMeals(rows: DraftMealRow[]): ServerPayloadValidationResult | null {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const n = i + 1
    for (const err of [
      checkMoney(r.pax, `식사 #${n} 인원`),
      checkMoney(r.unit_price_vnd, `식사 #${n} 단가`),
    ]) {
      if (err) return err
    }
  }
  return null
}

function validateEntrances(rows: DraftEntranceRow[]): ServerPayloadValidationResult | null {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const n = i + 1
    for (const err of [
      checkMoney(r.pax, `입장 #${n} 인원`),
      checkMoney(r.unit_price_vnd, `입장 #${n} 단가`),
    ]) {
      if (err) return err
    }
  }
  return null
}

function validateOthers(rows: DraftOtherRow[]): ServerPayloadValidationResult | null {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const n = i + 1
    for (const err of [
      checkMoney(r.amount_usd, `기타 #${n} USD`),
      checkMoney(r.amount_vnd, `기타 #${n} VND`),
    ]) {
      if (err) return err
    }
  }
  return null
}

function validateCompanyExpenses(
  rows: DraftCompanyExpenseRow[],
): ServerPayloadValidationResult | null {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const n = i + 1
    for (const err of [
      checkMoney(r.amount_usd, `회사비용 #${n} USD`),
      checkMoney(r.amount_vnd, `회사비용 #${n} VND`),
    ]) {
      if (err) return err
    }
  }
  return null
}

function validateShoppings(rows: DraftShoppingRow[]): ServerPayloadValidationResult | null {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const n = i + 1
    for (const err of [
      checkMoney(r.sale_usd, `쇼핑 #${n} SALE`),
      checkMoney(r.com_usd, `쇼핑 #${n} COM`),
      checkMoney(r.kb_usd, `쇼핑 #${n} KB`),
    ]) {
      if (err) return err
    }
  }
  return null
}

function validateOptions(rows: DraftOptionRow[]): ServerPayloadValidationResult | null {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const n = i + 1
    for (const err of [
      checkMoney(r.unit_price_usd, `옵션 #${n} 단가`),
      checkMoney(r.pax, `옵션 #${n} 인원`),
      checkMoney(r.expense_usd, `옵션 #${n} 지출 USD`),
      checkMoney(r.expense_vnd, `옵션 #${n} 지출 VND`),
    ]) {
      if (err) return err
    }
  }
  return null
}

/** Server-side guard for draft/admin save payloads (does not replace client validation). */
export function validateSettlementDraftPayload(
  payload: SettlementDraftPayload,
): ServerPayloadValidationResult {
  if (!isFiniteMoney(payload.exchange_rate) || payload.exchange_rate <= 0) {
    return { ok: false, error: '환율(Q2)은 0보다 커야 합니다.' }
  }

  const checks = [
    () => validateHeaderNumbers(payload.header),
    () => validateHotels(payload.hotels),
    () => validateMeals(payload.meals),
    () => validateEntrances(payload.entrances),
    () => validateOthers(payload.others),
    () => validateCompanyExpenses(payload.companyExpenses ?? []),
    () => validateShoppings(payload.shoppings),
    () => validateOptions(payload.options ?? []),
  ]

  for (const run of checks) {
    const err = run()
    if (err) return err
  }

  return { ok: true }
}

export function validateSettlementItemsPayload(payload: {
  exchange_rate: number
  hotels: DraftHotelRow[]
  meals: DraftMealRow[]
  entrances: DraftEntranceRow[]
  others: DraftOtherRow[]
  shoppings: DraftShoppingRow[]
  options: DraftOptionRow[]
}): ServerPayloadValidationResult {
  if (!isFiniteMoney(payload.exchange_rate) || payload.exchange_rate <= 0) {
    return { ok: false, error: '환율(Q2)은 0보다 커야 합니다.' }
  }

  const checks = [
    () => validateHotels(payload.hotels),
    () => validateMeals(payload.meals),
    () => validateEntrances(payload.entrances),
    () => validateOthers(payload.others),
    () => validateShoppings(payload.shoppings),
    () => validateOptions(payload.options ?? []),
  ]

  for (const run of checks) {
    const err = run()
    if (err) return err
  }

  return { ok: true }
}
