import type { Tour, SettlementFull, Receipt, SettlementStatus, Settlement } from '@/types'
import { MOCK_SETTLEMENT_INPUT, MOCK_TOUR_INFO } from './mock-data'
import type { SettlementCalcInput } from './types-calc'
import type {
  DraftEntranceRow,
  DraftCompanyExpenseRow,
  DraftHotelRow,
  DraftMealRow,
  DraftOptionRow,
  DraftOtherRow,
  DraftShoppingRow,
  SettlementFormState,
} from './form-types'
import { defaultHeader, newClientId } from './defaults'
import {
  mergeAdminHeaderForSave,
  mergeAdminHotelRowsForSave,
  mergeAdminOptionRowsForSave,
  mergeAdminShoppingRowsForSave,
  mergeGuideHeaderForSave,
  mergeGuideHotelRowsForSave,
  mergeGuideOptionRowsForSave,
  mergeGuideShoppingRowsForSave,
  pickAdminHeaderFields,
} from './field-ownership'
import { normalizeExternalReceivableForForm } from './external-receivable'
import { normalizeOtherAmountsFromDb } from './other-expense-migrate'
import {
  calcEntranceAmountVnd,
  calcHotelCompanyUsd,
  calcMealAmountVnd,
  calcOptionRowComUsd,
  calcOptionTotalSaleUsd,
} from './calc'

/** SSOT for tour/ground fee until tour_fee_usd column is dropped. */
export function resolveGroundFeeUsd(
  row: Pick<Settlement, 'ground_fee_usd' | 'tour_fee_usd'>,
): number {
  const ground = row.ground_fee_usd ?? 0
  if (ground > 0) return ground
  return row.tour_fee_usd ?? 0
}

function withClientId<T extends { id: string }>(
  row: T,
): T & { clientId: string } {
  return { ...row, clientId: row.id || newClientId() }
}

export function stateFromSettlementFull(
  full: SettlementFull,
  guideName: string,
): SettlementFormState {
  return {
    settlementId: full.id,
    tourId: full.tour_id,
    tour: full.tour,
    guideName,
    exchange_rate: full.exchange_rate,
    header: {
      advance_vnd: full.advance_vnd,
      charming_other_usd: full.charming_other_usd,
      tip_received_usd: full.tip_received_usd,
      ...normalizeExternalReceivableForForm(full),
      ground_fee_usd: resolveGroundFeeUsd(full),
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
    hotels: full.hotels.map(withClientId),
    meals: full.meals.map(withClientId),
    entrances: full.entrances.map(withClientId),
    others: full.others.map((o) => {
      const amounts = normalizeOtherAmountsFromDb(o)
      return withClientId({
        id: o.id,
        description: o.description,
        amount_usd: amounts.amount_usd,
        amount_vnd: amounts.amount_vnd,
        note: o.note ?? null,
      })
    }),
    shoppings: full.shoppings.map(withClientId),
    options: full.options.map(withClientId),
    companyExpenses: (full.company_expenses ?? []).map((row) =>
      withClientId({
        id: row.id,
        description: row.description,
        amount_usd: row.amount_usd,
        amount_vnd: row.amount_vnd,
        note: row.note ?? null,
      }),
    ),
    receipts: full.receipts,
    settlementStatus: full.status,
    guideSubmitSnapshotId: full.guide_submit_snapshot_id,
    dirty: false,
    saveStatus: 'idle',
    lastSavedAt: null,
    saveError: null,
  }
}

export function emptyFormState(guideName: string, exchangeRate = 26000): SettlementFormState {
  return {
    settlementId: null,
    tourId: null,
    tour: null,
    guideName,
    exchange_rate: exchangeRate,
    header: defaultHeader(),
    hotels: [],
    meals: [],
    entrances: [],
    others: [],
    companyExpenses: [],
    shoppings: [],
    options: [],
    receipts: [],
    settlementStatus: null,
    guideSubmitSnapshotId: null,
    dirty: false,
    saveStatus: 'idle',
    lastSavedAt: null,
    saveError: null,
  }
}

/** Map store → calcSettlement input (only calc source for UI). */
export function toCalcInput(state: SettlementFormState): SettlementCalcInput {
  return {
    exchange_rate: state.exchange_rate,
    header: state.header,
    hotels: (state.hotels ?? []).map((h) => ({
      sgl_count: h.sgl_count,
      twn_count: h.twn_count,
      trp_count: h.trp_count,
      nights: h.nights,
      unit_price_sgl_usd: h.unit_price_sgl_usd,
      unit_price_trp_usd: h.unit_price_trp_usd,
      guide_amount_usd: h.guide_amount_usd,
      deleted: h.deleted,
    })),
    meals: (state.meals ?? []).map((m) => ({
      pax: m.pax,
      unit_price_vnd: m.unit_price_vnd,
      deleted: m.deleted,
    })),
    entrances: (state.entrances ?? []).map((e) => ({
      pax: e.pax,
      unit_price_vnd: e.unit_price_vnd,
      deleted: e.deleted,
    })),
    others: (state.others ?? []).map((o) => ({
      amount_usd: o.amount_usd,
      amount_vnd: o.amount_vnd,
      deleted: o.deleted,
    })),
    company_expenses: (state.companyExpenses ?? []).map((row) => ({
      amount_usd: row.amount_usd,
      amount_vnd: row.amount_vnd,
      deleted: row.deleted,
    })),
    shoppings: (state.shoppings ?? []).map((s) => ({
      sale_usd: s.sale_usd,
      com_usd: s.com_usd,
      kb_usd: s.kb_usd,
      deleted: s.deleted,
    })),
    options: (state.options ?? []).map((o) => ({
      unit_price_usd: o.unit_price_usd,
      pax: o.pax,
      expense_usd: o.expense_usd,
      expense_vnd: o.expense_vnd,
      is_extra_vehicle: o.is_extra_vehicle,
      deleted: o.deleted,
    })),
  }
}

export type SettlementDraftPayload = {
  settlementId: string | null
  tourId: string
  exchange_rate: number
  header: SettlementFormState['header']
  hotels: DraftHotelRow[]
  meals: DraftMealRow[]
  entrances: DraftEntranceRow[]
  others: DraftOtherRow[]
  companyExpenses: DraftCompanyExpenseRow[]
  shoppings: DraftShoppingRow[]
  options: DraftOptionRow[]
}

export function toDraftPayload(state: SettlementFormState): SettlementDraftPayload {
  if (!state.tourId) throw new Error('투어를 선택해주세요.')
  return {
    settlementId: state.settlementId,
    tourId: state.tourId,
    exchange_rate: state.exchange_rate,
    header: state.header,
    hotels: state.hotels,
    meals: state.meals,
    entrances: state.entrances,
    others: state.others,
    companyExpenses: state.companyExpenses ?? [],
    shoppings: state.shoppings,
    options: state.options,
  }
}

/** Strip admin-owned fields from guide draft saves; preserve DB values when updating. */
export function sanitizeGuideDraftPayload(
  payload: SettlementDraftPayload,
  existing: SettlementFull | null,
): SettlementDraftPayload {
  if (!existing) {
    return {
      ...payload,
      header: mergeGuideHeaderForSave(payload.header, null),
    }
  }

  const existingState = stateFromSettlementFull(existing, '')
  return {
    ...payload,
    header: mergeGuideHeaderForSave(payload.header, pickAdminHeaderFields(existingState.header)),
    hotels: mergeGuideHotelRowsForSave(payload.hotels, existingState.hotels),
    shoppings: mergeGuideShoppingRowsForSave(payload.shoppings, existingState.shoppings),
    options: mergeGuideOptionRowsForSave(payload.options, existingState.options),
  }
}

/** Strip guide-owned fields from admin review saves; preserve DB guide values. */
export function sanitizeAdminDraftPayload(
  payload: SettlementDraftPayload,
  existing: SettlementFull,
): SettlementDraftPayload {
  const existingState = stateFromSettlementFull(existing, '')
  return {
    settlementId: existing.id,
    tourId: existing.tour_id,
    exchange_rate: existing.exchange_rate,
    header: mergeAdminHeaderForSave(payload.header, existingState.header),
    hotels: mergeAdminHotelRowsForSave(payload.hotels, existingState.hotels),
    meals: existingState.meals,
    entrances: existingState.entrances,
    others: existingState.others,
    shoppings: mergeAdminShoppingRowsForSave(payload.shoppings, existingState.shoppings),
    options: mergeAdminOptionRowsForSave(payload.options, existingState.options),
    companyExpenses: payload.companyExpenses ?? [],
  }
}

/** Merge DB ids back into draft rows after save (by active-row index). */
export function mergeRowIds<T extends { clientId: string; id?: string; deleted?: boolean }>(
  draftRows: T[],
  serverRows: { id: string }[],
): T[] {
  const active = draftRows.filter((r) => !r.deleted)
  return draftRows.map((row) => {
    if (row.deleted) return row
    const idx = active.indexOf(row)
    const server = idx >= 0 ? serverRows[idx] : undefined
    return server ? { ...row, id: server.id } : row
  })
}

export type SettlementSyncPayload = {
  status: SettlementStatus
  receipts: Receipt[]
  hotels: SettlementFull['hotels']
  meals: SettlementFull['meals']
  entrances: SettlementFull['entrances']
  others: SettlementFull['others']
  company_expenses: SettlementFull['company_expenses']
  shoppings: SettlementFull['shoppings']
  options: SettlementFull['options']
}

export function mergeServerSync(
  state: SettlementFormState,
  sync: SettlementSyncPayload,
): Partial<SettlementFormState> {
  return {
    settlementStatus: sync.status,
    receipts: sync.receipts,
    hotels: mergeRowIds(state.hotels, sync.hotels),
    meals: mergeRowIds(state.meals, sync.meals),
    entrances: mergeRowIds(state.entrances, sync.entrances),
    others: mergeRowIds(state.others, sync.others),
    companyExpenses: mergeRowIds(state.companyExpenses ?? [], sync.company_expenses ?? []),
    shoppings: mergeRowIds(state.shoppings, sync.shoppings),
    options: mergeRowIds(state.options, sync.options),
  }
}

/** Split DB rows for delete/insert/upsert — new rows omit id and must use insert, not upsert. */
export function splitDbRowsForPersist(rows: Record<string, unknown>[]) {
  const keepIds = rows.map((r) => r.id).filter(Boolean) as string[]
  const toInsert = rows.filter((r) => !r.id)
  const toUpdate = rows.filter((r) => r.id)
  return { keepIds, toInsert, toUpdate }
}

export function isMissingDbColumnError(message: string, column: string): boolean {
  return message.includes(`'${column}'`) || message.includes(column)
}

/** settlements row patch for admin review save (admin-owned header fields only). */
export function buildAdminSettlementHeaderPatch(
  existing: Pick<SettlementFull, 'tour_fee_usd'>,
  header: SettlementDraftPayload['header'],
  reviewedBy: string,
  options?: { legacyGroundFeeInTourFee?: boolean },
): Record<string, unknown> {
  const groundFee = header.ground_fee_usd ?? 0
  const base = {
    vehicle_fee_usd: header.vehicle_fee_usd,
    head_tax_usd: header.head_tax_usd,
    seoul_biz_fee_usd: header.seoul_biz_fee_usd,
    tc_company_usd: header.tc_company_usd,
    megugi_usd: header.megugi_usd,
    guide_daily_fee_usd: header.guide_daily_fee_usd,
    settlement_ratio: header.settlement_ratio,
    reviewed_by: reviewedBy,
  }
  if (options?.legacyGroundFeeInTourFee) {
    return {
      ...base,
      tour_fee_usd: groundFee || (existing.tour_fee_usd ?? 0),
    }
  }
  return {
    ...base,
    tour_fee_usd: existing.tour_fee_usd ?? 0,
    ground_fee_usd: groundFee,
  }
}

/** DB write rows — computed amounts applied server-side from same calc helpers. */
export function buildHotelDbRows(rows: DraftHotelRow[], settlementId: string) {
  return rows
    .filter((r) => !r.deleted)
    .map((r, i) => ({
      ...(r.id ? { id: r.id } : {}),
      settlement_id: settlementId,
      hotel_name: r.hotel_name,
      check_in_date: r.check_in_date,
      nights: r.nights,
      sgl_count: r.sgl_count,
      twn_count: r.twn_count,
      trp_count: r.trp_count,
      unit_price_sgl_usd: r.unit_price_sgl_usd,
      unit_price_trp_usd: r.unit_price_trp_usd,
      company_amount_usd: calcHotelCompanyUsd(r),
      guide_amount_usd: r.guide_amount_usd,
      sort_order: i,
    }))
}

export function buildMealDbRows(rows: DraftMealRow[], settlementId: string) {
  return rows.filter((r) => !r.deleted).map((r, i) => ({
    ...(r.id ? { id: r.id } : {}),
    settlement_id: settlementId,
    meal_date: r.meal_date,
    restaurant_name: r.restaurant_name,
    pax: r.pax,
    unit_price_vnd: r.unit_price_vnd,
    amount_vnd: calcMealAmountVnd(r),
    sort_order: i,
  }))
}

export function buildEntranceDbRows(rows: DraftEntranceRow[], settlementId: string) {
  return rows.filter((r) => !r.deleted).map((r, i) => ({
    ...(r.id ? { id: r.id } : {}),
    settlement_id: settlementId,
    visit_date: r.visit_date,
    attraction_name: r.attraction_name,
    pax: r.pax,
    unit_price_vnd: r.unit_price_vnd,
    amount_vnd: calcEntranceAmountVnd(r),
    sort_order: i,
  }))
}

export function buildOtherDbRows(rows: DraftOtherRow[], settlementId: string) {
  return rows.filter((r) => !r.deleted).map((r, i) => ({
    ...(r.id ? { id: r.id } : {}),
    settlement_id: settlementId,
    description: r.description,
    days: 0,
    pax: 0,
    unit_price_usd: 0,
    unit_price_vnd: 0,
    amount_usd: r.amount_usd,
    amount_vnd: r.amount_vnd,
    is_tip: false,
    note: r.note,
    entry_mode: 'flat' as const,
    sort_order: i,
  }))
}

export function buildCompanyExpenseDbRows(
  rows: DraftCompanyExpenseRow[],
  settlementId: string,
) {
  return rows.filter((r) => !r.deleted).map((r, i) => ({
    ...(r.id ? { id: r.id } : {}),
    settlement_id: settlementId,
    description: r.description,
    amount_usd: r.amount_usd,
    amount_vnd: r.amount_vnd,
    note: r.note,
    sort_order: i,
  }))
}

export function buildShoppingDbRows(rows: DraftShoppingRow[], settlementId: string) {
  return rows.filter((r) => !r.deleted).map((r, i) => ({
    ...(r.id ? { id: r.id } : {}),
    settlement_id: settlementId,
    visit_date: r.visit_date,
    shop_name: r.shop_name,
    sale_usd: r.sale_usd,
    com_usd: r.com_usd,
    kb_usd: r.kb_usd,
    sort_order: i,
  }))
}

export function buildOptionDbRows(rows: DraftOptionRow[], settlementId: string, rate: number) {
  return rows.filter((r) => !r.deleted).map((r, i) => ({
    ...(r.id ? { id: r.id } : {}),
    settlement_id: settlementId,
    option_date: r.option_date,
    option_name: r.option_name,
    unit_price_usd: r.unit_price_usd,
    pax: r.pax,
    total_sale_usd: calcOptionTotalSaleUsd(r),
    expense_usd: r.expense_usd,
    expense_vnd: r.expense_vnd,
    com_usd: r.is_extra_vehicle ? 0 : calcOptionRowComUsd(r, rate),
    is_extra_vehicle: !!r.is_extra_vehicle,
    sort_order: i,
  }))
}

export function tourLabel(tour: Tour): string {
  return `[${tour.tour_code}] ${tour.pattern} — ${tour.start_date}~${tour.end_date}`
}

/** Phase 2 preview — hydrate store from mock Excel sample (no DB). */
export function stateFromMock(guideName = '데모'): SettlementFormState {
  const mock = MOCK_SETTLEMENT_INPUT
  const mockTour: Tour = {
    id: 'mock-tour-preview',
    tour_code: MOCK_TOUR_INFO.tour_code,
    pattern: MOCK_TOUR_INFO.pattern,
    agency_name: MOCK_TOUR_INFO.agency_name,
    start_date: MOCK_TOUR_INFO.start_date,
    end_date: MOCK_TOUR_INFO.end_date,
    nights: MOCK_TOUR_INFO.nights,
    pax_count: MOCK_TOUR_INFO.pax_count,
    vehicle_type: MOCK_TOUR_INFO.vehicle_type,
    guide_id: 'mock',
    tc_name: MOCK_TOUR_INFO.tc_name,
    branch_id: 'mock',
    assignment_status: 'assigned',
    recalled_at: null,
    recalled_by: null,
    created_by: 'mock',
    created_at: '',
    updated_at: '',
  }

  return {
    settlementId: null,
    tourId: mockTour.id,
    tour: mockTour,
    guideName,
    exchange_rate: mock.exchange_rate,
    header: { ...mock.header, guide_note: null },
    hotels: mock.hotels.map((h, i) => ({
      clientId: newClientId(),
      hotel_name: i === 0 ? 'Grand Mercure' : 'Hoiana',
      check_in_date: null,
      nights: h.nights,
      sgl_count: h.sgl_count,
      twn_count: h.twn_count,
      trp_count: h.trp_count,
      unit_price_sgl_usd: h.unit_price_sgl_usd,
      unit_price_trp_usd: h.unit_price_trp_usd,
      guide_amount_usd: h.guide_amount_usd,
    })),
    meals: mock.meals.map((m) => ({
      clientId: newClientId(),
      meal_date: null,
      restaurant_name: '',
      pax: m.pax,
      unit_price_vnd: m.unit_price_vnd,
    })),
    entrances: mock.entrances.map((e) => ({
      clientId: newClientId(),
      visit_date: null,
      attraction_name: '',
      pax: e.pax,
      unit_price_vnd: e.unit_price_vnd,
    })),
    others: mock.others.map((o) => ({
      clientId: newClientId(),
      description: '',
      amount_usd: o.amount_usd,
      amount_vnd: o.amount_vnd,
      note: null,
    })),
    companyExpenses: [],
    shoppings: mock.shoppings.map((s) => ({
      clientId: newClientId(),
      visit_date: null,
      shop_name: '',
      sale_usd: s.sale_usd,
      com_usd: s.com_usd,
      kb_usd: s.kb_usd,
    })),
    options: mock.options.map((o) => ({
      clientId: newClientId(),
      option_date: null,
      option_name: o.is_extra_vehicle ? '차량비(추가)' : '',
      unit_price_usd: o.unit_price_usd,
      pax: o.pax,
      expense_usd: o.expense_usd,
      expense_vnd: o.expense_vnd,
      is_extra_vehicle: o.is_extra_vehicle ?? false,
    })),
    receipts: [],
    settlementStatus: 'draft',
    guideSubmitSnapshotId: null,
    dirty: false,
    saveStatus: 'idle',
    lastSavedAt: null,
    saveError: null,
  }
}
