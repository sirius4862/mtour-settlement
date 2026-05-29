import type {
  DraftHotelRow,
  DraftOptionRow,
  DraftShoppingRow,
  SettlementFormHeader,
} from './form-types'
import type { SettlementHeaderCalc } from './types-calc'
import type { SettlementStatus } from '@/types'

/** Who is editing the settlement form. */
export type SettlementFormRole = 'guide' | 'admin' | 'readOnly'

/**
 * Admin-only header fields — preserved from DB on guide save.
 */
export const ADMIN_STRICT_HEADER_KEYS = [
  'ground_fee_usd',
  'vehicle_fee_usd',
  'head_tax_usd',
  'seoul_biz_fee_usd',
  'tc_company_usd',
  'settlement_ratio',
] as const satisfies readonly (keyof SettlementHeaderCalc)[]

/**
 * Guide enters in draft; company reviews after submit.
 * Admin may adjust in submitted / clarification_requested.
 * Included in confirm-workflow diff when values change post-submit.
 */
export const COMPANY_REVIEW_HEADER_KEYS = [
  'megugi_usd',
  'guide_daily_fee_usd',
] as const satisfies readonly (keyof SettlementHeaderCalc)[]

/** All header fields admin may change during post-submit review save. */
export const ADMIN_OWNED_HEADER_KEYS = [
  ...ADMIN_STRICT_HEADER_KEYS,
  ...COMPANY_REVIEW_HEADER_KEYS,
] as const satisfies readonly (keyof SettlementHeaderCalc)[]

export type AdminStrictHeaderKey = (typeof ADMIN_STRICT_HEADER_KEYS)[number]
export type CompanyReviewHeaderKey = (typeof COMPANY_REVIEW_HEADER_KEYS)[number]
export type AdminOwnedHeaderKey = (typeof ADMIN_OWNED_HEADER_KEYS)[number]

const DEFAULT_SETTLEMENT_RATIO = 0.5

export function isAdminStrictHeaderKey(key: keyof SettlementHeaderCalc): key is AdminStrictHeaderKey {
  return (ADMIN_STRICT_HEADER_KEYS as readonly string[]).includes(key)
}

export function isCompanyReviewHeaderKey(key: keyof SettlementHeaderCalc): key is CompanyReviewHeaderKey {
  return (COMPANY_REVIEW_HEADER_KEYS as readonly string[]).includes(key)
}

export function isAdminOwnedHeaderKey(key: keyof SettlementHeaderCalc): key is AdminOwnedHeaderKey {
  return (ADMIN_OWNED_HEADER_KEYS as readonly string[]).includes(key)
}

export function canEditHeaderField(role: SettlementFormRole, key: keyof SettlementHeaderCalc): boolean {
  if (role === 'readOnly') return false
  if (role === 'admin') return true
  return !isAdminStrictHeaderKey(key)
}

export function canEditHotelUnitPrices(role: SettlementFormRole): boolean {
  return role === 'admin'
}

export function canEditShoppingKb(role: SettlementFormRole): boolean {
  return role === 'admin'
}

export function canEditExtraVehicle(role: SettlementFormRole): boolean {
  return role === 'admin'
}

export function canAddExtraVehicle(role: SettlementFormRole): boolean {
  return role === 'admin'
}

/** Guide adds hotel rows in draft; admin may add rows to enter unit prices during review. */
export function canAddHotelRows(role: SettlementFormRole): boolean {
  return role !== 'readOnly'
}

/** Merge admin-owned header from incoming; preserve guide-owned from existing. */
export function mergeAdminHeaderForSave(
  incoming: SettlementFormHeader,
  existing: SettlementFormHeader,
): SettlementFormHeader {
  return {
    ...existing,
    ...pickAdminHeaderFields(incoming),
  }
}

/** Admin-owned hotel unit prices (M8/O8) with at least one non-zero value. */
export function hasMeaningfulAdminHotelCompanyData(
  row: Pick<DraftHotelRow, 'unit_price_sgl_usd' | 'unit_price_trp_usd'>,
): boolean {
  return row.unit_price_sgl_usd > 0 || row.unit_price_trp_usd > 0
}

function adminOwnedHotelFields(
  incoming: Pick<DraftHotelRow, 'unit_price_sgl_usd' | 'unit_price_trp_usd'>,
): Pick<DraftHotelRow, 'unit_price_sgl_usd' | 'unit_price_trp_usd'> {
  return {
    unit_price_sgl_usd: incoming.unit_price_sgl_usd,
    unit_price_trp_usd: incoming.unit_price_trp_usd,
  }
}

function adminAddedHotelRow(incoming: DraftHotelRow): DraftHotelRow {
  return {
    clientId: incoming.clientId,
    hotel_name: '',
    check_in_date: null,
    nights: 0,
    sgl_count: 0,
    twn_count: 0,
    trp_count: 0,
    guide_amount_usd: 0,
    ...adminOwnedHotelFields(incoming),
  }
}

/** Preserve guide-owned hotel columns; apply admin unit prices; append admin-added rows. */
export function mergeAdminHotelRowsForSave(
  incoming: DraftHotelRow[],
  existing: DraftHotelRow[],
): DraftHotelRow[] {
  const incomingActive = incoming.filter((r) => !r.deleted)
  const incomingById = new Map(incomingActive.filter((r) => r.id).map((r) => [r.id!, r]))

  const mergedExisting = existing
    .filter((r) => !r.deleted)
    .map((row) => {
      const inc = row.id ? incomingById.get(row.id) : undefined
      if (!inc) return row
      return {
        ...row,
        ...adminOwnedHotelFields(inc),
      }
    })

  const adminAdded = incomingActive
    .filter((row) => !row.id)
    .filter((row) => hasMeaningfulAdminHotelCompanyData(row))
    .map(adminAddedHotelRow)

  return [...mergedExisting, ...adminAdded]
}

/** Preserve guide sale/com; apply admin KB from incoming. */
export function mergeAdminShoppingRowsForSave(
  incoming: DraftShoppingRow[],
  existing: DraftShoppingRow[],
): DraftShoppingRow[] {
  const byId = new Map(incoming.filter((r) => r.id).map((r) => [r.id!, r]))
  return existing.map((row) => {
    const inc = row.id ? byId.get(row.id) : undefined
    return { ...row, kb_usd: inc?.kb_usd ?? row.kb_usd }
  })
}

/** Preserve guide options; admin may add/edit extra-vehicle rows only. */
export function mergeAdminOptionRowsForSave(
  incoming: DraftOptionRow[],
  existing: DraftOptionRow[],
): DraftOptionRow[] {
  const guideOptions = existing.filter((r) => !r.is_extra_vehicle)
  const incomingExtra = incoming.filter((r) => r.is_extra_vehicle && !r.deleted)
  return [...guideOptions, ...incomingExtra]
}

/** Merge admin-owned header fields from DB when a guide saves. */
export function mergeGuideHeaderForSave(
  incoming: SettlementFormHeader,
  existing: Partial<SettlementHeaderCalc> | null | undefined,
): SettlementFormHeader {
  const merged: SettlementFormHeader = { ...incoming }
  for (const key of ADMIN_STRICT_HEADER_KEYS) {
    if (existing && key in existing && existing[key] != null) {
      merged[key] = existing[key] as number
    } else if (key === 'settlement_ratio') {
      merged.settlement_ratio = DEFAULT_SETTLEMENT_RATIO
    } else {
      merged[key] = 0
    }
  }
  return merged
}

export function pickAdminHeaderFields(
  row: Partial<SettlementHeaderCalc>,
): Pick<SettlementHeaderCalc, AdminOwnedHeaderKey> {
  return {
    ground_fee_usd: row.ground_fee_usd ?? 0,
    vehicle_fee_usd: row.vehicle_fee_usd ?? 0,
    head_tax_usd: row.head_tax_usd ?? 0,
    seoul_biz_fee_usd: row.seoul_biz_fee_usd ?? 0,
    tc_company_usd: row.tc_company_usd ?? 0,
    megugi_usd: row.megugi_usd ?? 0,
    guide_daily_fee_usd: row.guide_daily_fee_usd ?? 0,
    settlement_ratio: row.settlement_ratio ?? DEFAULT_SETTLEMENT_RATIO,
  }
}

/** Preserve admin-owned columns on hotel rows when guide saves. */
export function mergeGuideHotelRowsForSave(
  incoming: DraftHotelRow[],
  existing: DraftHotelRow[] | null | undefined,
): DraftHotelRow[] {
  if (!existing?.length) return incoming
  const byId = new Map(existing.filter((r) => r.id).map((r) => [r.id!, r]))
  return incoming.map((row) => {
    const prev = row.id ? byId.get(row.id) : undefined
    if (!prev) return row
    return {
      ...row,
      unit_price_sgl_usd: prev.unit_price_sgl_usd,
      unit_price_trp_usd: prev.unit_price_trp_usd,
    }
  })
}

export function mergeGuideShoppingRowsForSave(
  incoming: DraftShoppingRow[],
  existing: DraftShoppingRow[] | null | undefined,
): DraftShoppingRow[] {
  if (!existing?.length) return incoming
  const byId = new Map(existing.filter((r) => r.id).map((r) => [r.id!, r]))
  return incoming.map((row) => {
    const prev = row.id ? byId.get(row.id) : undefined
    if (!prev) return { ...row, kb_usd: 0 }
    return { ...row, kb_usd: prev.kb_usd }
  })
}

/** Guide saves must not add or alter extra-vehicle rows. */
export function mergeGuideOptionRowsForSave(
  incoming: DraftOptionRow[],
  existing: DraftOptionRow[] | null | undefined,
): DraftOptionRow[] {
  const guideOptions = incoming.filter((r) => !r.is_extra_vehicle)
  const existingExtra = (existing ?? []).filter((r) => r.is_extra_vehicle && !r.deleted)
  return [...guideOptions, ...existingExtra]
}

/** Header fields included in confirm-workflow diff (admin post-submit edits). */
export const CONFIRM_DIFF_HEADER_KEYS = [
  ...ADMIN_OWNED_HEADER_KEYS,
] as const satisfies readonly (keyof SettlementHeaderCalc)[]

export const COMPANY_REVIEW_FIELD_HINT = '회사 확인 대상'
export const GUIDE_INPUT_FIELD_HINT = '가이드 입력 항목'
export const ADMIN_GUIDE_INPUT_HINT = '가이드 입력값 · 회사 확인 필요'

export function canGuideEditCompanyReviewFields(status: SettlementStatus): boolean {
  return status === 'draft' || status === 'rejected' || status === 'edit_requested'
}

export function canAdminEditCompanyReviewFields(status: SettlementStatus): boolean {
  return status === 'submitted' || status === 'clarification_requested'
}

export function hasGuideOwnedLineItemData(state: {
  hotels?: DraftHotelRow[]
  meals?: { deleted?: boolean; pax: number; unit_price_vnd: number; restaurant_name: string }[]
  entrances?: { deleted?: boolean; pax: number; unit_price_vnd: number; attraction_name: string }[]
  others?: { deleted?: boolean; pax: number; unit_price_usd: number; unit_price_vnd: number; description: string }[]
  shoppings?: { deleted?: boolean; sale_usd: number; com_usd: number; shop_name: string }[]
  options?: { deleted?: boolean; is_extra_vehicle?: boolean; pax: number; unit_price_usd: number; option_name: string }[]
}): boolean {
  const hotels = (state.hotels ?? []).filter((r) => !r.deleted)
  const meals = (state.meals ?? []).filter((r) => !r.deleted)
  const entrances = (state.entrances ?? []).filter((r) => !r.deleted)
  const others = (state.others ?? []).filter((r) => !r.deleted)
  const shoppings = (state.shoppings ?? []).filter((r) => !r.deleted)
  const options = (state.options ?? []).filter((r) => !r.deleted && !r.is_extra_vehicle)

  if (hotels.some((r) => r.hotel_name.trim() || r.guide_amount_usd > 0 || r.sgl_count + r.twn_count + r.trp_count > 0)) {
    return true
  }
  if (meals.some((r) => r.restaurant_name.trim() || r.pax > 0 || r.unit_price_vnd > 0)) return true
  if (entrances.some((r) => r.attraction_name.trim() || r.pax > 0 || r.unit_price_vnd > 0)) return true
  if (others.some((r) => r.description.trim() || r.pax > 0 || r.unit_price_usd > 0 || r.unit_price_vnd > 0)) {
    return true
  }
  if (shoppings.some((r) => r.shop_name.trim() || r.sale_usd > 0 || r.com_usd > 0)) return true
  if (options.some((r) => r.option_name.trim() || r.pax > 0 || r.unit_price_usd > 0)) return true
  return false
}
