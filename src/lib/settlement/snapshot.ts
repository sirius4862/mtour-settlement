import { calcSettlement } from './calc'
import type { SettlementCalcResult } from './types-calc'
import { CONFIRM_DIFF_HEADER_KEYS } from './field-ownership'
import { resolveGroundFeeUsd, stateFromSettlementFull, toCalcInput } from './mappers'
import { normalizeExternalReceivableForForm, resolveOptionCreditUsd } from './external-receivable'
import type { SettlementFieldOwner, SettlementFull } from '@/types'

/** Serializable settlement state stored in settlement_snapshots.payload_json */
export interface SnapshotPayload {
  exchange_rate: number
  header: Record<string, number | string | null>
  hotels: Array<Record<string, unknown>>
  meals: Array<Record<string, unknown>>
  entrances: Array<Record<string, unknown>>
  others: Array<Record<string, unknown>>
  shoppings: Array<Record<string, unknown>>
  options: Array<Record<string, unknown>>
  calc_summary: SnapshotCalcSummary
}

export interface SnapshotCalcSummary {
  company_deposit_usd: number
  guide_settlement_usd: number
  guide_payout_usd: number
  company_grand_total_usd: number
}

export interface FieldChangeDraft {
  field_path: string
  excel_ref: string | null
  label: string
  owner: SettlementFieldOwner
  old_value_json: unknown
  new_value_json: unknown
  old_display: string
  new_display: string
}

const HEADER_LABELS: Record<string, { label: string; excelRef: string; owner: SettlementFieldOwner }> = {
  ground_fee_usd: { label: '투어피/지상비 (회사 수익)', excelRef: '—', owner: 'admin' },
  vehicle_fee_usd: { label: '차량비', excelRef: 'O79', owner: 'admin' },
  head_tax_usd: { label: '인두세', excelRef: 'O80', owner: 'admin' },
  seoul_biz_fee_usd: { label: '서울영업비', excelRef: 'O81', owner: 'admin' },
  tc_company_usd: { label: 'T/C 회사분', excelRef: 'J83', owner: 'admin' },
  megugi_usd: { label: '메꾸기', excelRef: 'R80', owner: 'guide' },
  guide_daily_fee_usd: { label: '가이드 일비', excelRef: 'R82', owner: 'guide' },
  settlement_ratio: { label: '정산비율', excelRef: 'R77', owner: 'admin' },
  advance_vnd: { label: '전도금', excelRef: 'A76', owner: 'guide' },
  tc_guide_usd: { label: 'T/C 가이드분', excelRef: 'H83', owner: 'guide' },
}

const CALC_LABELS: Record<keyof SnapshotCalcSummary, { label: string; excelRef: string }> = {
  company_deposit_usd: { label: '회사입금액', excelRef: 'Q75' },
  guide_settlement_usd: { label: '계산상 가이드 정산금액', excelRef: 'R85' },
  guide_payout_usd: { label: '가이드 정산금액', excelRef: 'P85' },
  company_grand_total_usd: { label: '회사수익', excelRef: 'R87' },
}

/** Included in confirm-workflow diff (admin + stored field_changes). */
const CONFIRM_DIFF_CALC_KEYS: (keyof SnapshotCalcSummary)[] = [
  'company_deposit_usd',
  'guide_settlement_usd',
  'guide_payout_usd',
]

/** Never shown on guide confirm UI or in guide-facing change lists. */
export const GUIDE_HIDDEN_CONFIRM_FIELD_PATHS = [
  'calc_summary.company_grand_total_usd',
  'header.ground_fee_usd',
] as const

export const SHOPPING_KB_LABEL = 'KB (회사 전용 수익)'

export function isShoppingKbFieldPath(fieldPath: string): boolean {
  return fieldPath.endsWith('.kb_usd')
}

export function isGuideHiddenConfirmChange(change: {
  field_path: string
  excel_ref?: string | null
  label?: string
}): boolean {
  if ((GUIDE_HIDDEN_CONFIRM_FIELD_PATHS as readonly string[]).includes(change.field_path)) {
    return true
  }
  if (isShoppingKbFieldPath(change.field_path)) return true
  if (change.excel_ref === 'H57' || change.excel_ref === 'H72') return true
  if (change.label === SHOPPING_KB_LABEL || change.label === '쇼핑 KB') return true
  if (change.excel_ref === 'R87') return true
  if (change.label === '회사수익' || change.label?.includes('회사총수익')) return true
  return false
}

/** Strip company-internal profit fields before guide confirm page. */
export function filterGuideConfirmationChanges<T extends {
  field_path: string
  excel_ref?: string | null
  label?: string
}>(changes: T[]): T[] {
  return changes.filter((c) => !isGuideHiddenConfirmChange(c))
}

/** Remove company-only KB from snapshot payloads returned to guides. */
export function stripKbFromGuideSnapshotPayload(payload: SnapshotPayload): SnapshotPayload {
  return {
    ...payload,
    shoppings: payload.shoppings.map((row) => {
      const { kb_usd: _kb, ...rest } = row as { kb_usd?: number; [key: string]: unknown }
      return rest
    }),
  }
}

/** Strip KB from settlement rows in guide-facing API responses. */
export function sanitizeSettlementFullForGuide(full: SettlementFull): SettlementFull {
  return {
    ...full,
    shoppings: full.shoppings.map((s) => ({ ...s, kb_usd: 0 })),
  }
}

export function calcSummaryFromResult(result: SettlementCalcResult): SnapshotCalcSummary {
  return {
    company_deposit_usd: result.sections.cash.company_deposit_usd.value,
    guide_settlement_usd: result.summary.guide_settlement_usd.value,
    guide_payout_usd: result.summary.guide_payout_usd.value,
    company_grand_total_usd: result.summary.company_grand_total_usd.value,
  }
}

export function buildSnapshotPayload(full: SettlementFull): SnapshotPayload {
  const calc = calcSettlement(toCalcInput(stateFromSettlementFull(full, '')))
  return {
    exchange_rate: full.exchange_rate,
    header: {
      advance_vnd: full.advance_vnd,
      ground_fee_usd: resolveGroundFeeUsd(full),
      charming_other_usd: full.charming_other_usd,
      tip_received_usd: full.tip_received_usd,
      ...normalizeExternalReceivableForForm(full),
      option_credit_usd: resolveOptionCreditUsd(full),
      vehicle_fee_usd: full.vehicle_fee_usd,
      head_tax_usd: full.head_tax_usd,
      seoul_biz_fee_usd: full.seoul_biz_fee_usd,
      tc_guide_usd: full.tc_guide_usd,
      tc_company_usd: full.tc_company_usd,
      megugi_usd: full.megugi_usd,
      guide_daily_fee_usd: full.guide_daily_fee_usd,
      settlement_ratio: full.settlement_ratio,
      guide_note: full.guide_note,
    },
    hotels: full.hotels.map((h) => ({
      id: h.id,
      hotel_name: h.hotel_name,
      unit_price_sgl_usd: h.unit_price_sgl_usd,
      unit_price_trp_usd: h.unit_price_trp_usd,
      guide_amount_usd: h.guide_amount_usd,
      company_amount_usd: h.company_amount_usd,
    })),
    meals: full.meals.map((m) => ({ id: m.id, restaurant_name: m.restaurant_name, pax: m.pax, unit_price_vnd: m.unit_price_vnd })),
    entrances: full.entrances.map((e) => ({ id: e.id, attraction_name: e.attraction_name, pax: e.pax, unit_price_vnd: e.unit_price_vnd })),
    others: full.others.map((o) => ({ id: o.id, description: o.description, pax: o.pax, unit_price_usd: o.unit_price_usd, unit_price_vnd: o.unit_price_vnd })),
    shoppings: full.shoppings.map((s) => ({ id: s.id, shop_name: s.shop_name, sale_usd: s.sale_usd, com_usd: s.com_usd, kb_usd: s.kb_usd })),
    options: full.options.map((o) => ({
      id: o.id,
      option_name: o.option_name,
      is_extra_vehicle: o.is_extra_vehicle,
      unit_price_usd: o.unit_price_usd,
      pax: o.pax,
      expense_usd: o.expense_usd,
      expense_vnd: o.expense_vnd,
    })),
    calc_summary: calcSummaryFromResult(calc),
  }
}

function fmtUsd(v: number): string {
  if (v === 0) return '$0.00'
  return `$${v.toFixed(2)}`
}

function fmtRatio(v: number): string {
  return `${Math.round(v * 100)}%`
}

function fmtDisplay(path: string, value: unknown): string {
  if (value == null) return '—'
  if (path.endsWith('settlement_ratio') && typeof value === 'number') return fmtRatio(value)
  if (typeof value === 'number' && (path.includes('_usd') || path.startsWith('calc_summary.'))) {
    return fmtUsd(value)
  }
  if (typeof value === 'number' && path.includes('_vnd')) {
    return `₫${Math.round(value).toLocaleString('ko-KR')}`
  }
  return String(value)
}

function pushChange(
  changes: FieldChangeDraft[],
  path: string,
  label: string,
  excelRef: string | null,
  owner: SettlementFieldOwner,
  oldVal: unknown,
  newVal: unknown,
) {
  if (Object.is(oldVal, newVal)) return
  if (typeof oldVal === 'number' && typeof newVal === 'number' && Math.abs(oldVal - newVal) < 0.0001) {
    return
  }
  changes.push({
    field_path: path,
    excel_ref: excelRef,
    label,
    owner,
    old_value_json: oldVal,
    new_value_json: newVal,
    old_display: fmtDisplay(path, oldVal),
    new_display: fmtDisplay(path, newVal),
  })
}

/** Diff guide-submit baseline vs admin-reviewed current snapshot. */
export function diffSnapshotPayloads(
  before: SnapshotPayload,
  after: SnapshotPayload,
): FieldChangeDraft[] {
  const changes: FieldChangeDraft[] = []

  for (const key of CONFIRM_DIFF_HEADER_KEYS) {
    const meta = HEADER_LABELS[key]
    if (!meta) continue
    pushChange(
      changes,
      `header.${key}`,
      meta.label,
      meta.excelRef,
      meta.owner,
      before.header[key],
      after.header[key],
    )
  }

  for (const key of CONFIRM_DIFF_CALC_KEYS) {
    const meta = CALC_LABELS[key]
    pushChange(
      changes,
      `calc_summary.${key}`,
      meta.label,
      meta.excelRef,
      'calculated',
      before.calc_summary[key],
      after.calc_summary[key],
    )
  }

  const beforeHotels = new Map(before.hotels.map((h) => [String(h.id), h]))
  for (const row of after.hotels) {
    const prev = beforeHotels.get(String(row.id))
    if (!prev) continue
    const base = `hotels.${row.id}`
    pushChange(changes, `${base}.unit_price_sgl_usd`, '호텔 단가 SGL/TWN', 'M8', 'admin', prev.unit_price_sgl_usd, row.unit_price_sgl_usd)
    pushChange(changes, `${base}.unit_price_trp_usd`, '호텔 단가 TRP', 'O8', 'admin', prev.unit_price_trp_usd, row.unit_price_trp_usd)
  }

  const beforeShops = new Map(before.shoppings.map((s) => [String(s.id), s]))
  for (const row of after.shoppings) {
    const prev = beforeShops.get(String(row.id))
    if (!prev) continue
    pushChange(changes, `shoppings.${row.id}.kb_usd`, SHOPPING_KB_LABEL, 'H57', 'admin', prev.kb_usd, row.kb_usd)
  }

  return changes
}

export function parseSnapshotPayload(raw: unknown): SnapshotPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as SnapshotPayload
  if (!p.header || !p.calc_summary) return null
  return p
}
