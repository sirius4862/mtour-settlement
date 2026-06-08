// ============================================================================
// Vehicle Company Report — pure payload validation/normalization (no I/O).
// Operational only. This module NEVER references settlements, payout, money,
// calculation, or settlement status. Used by vehicleReportActions + the form.
// ============================================================================

export type VehicleReportStatus = 'draft' | 'submitted'

export interface DailyRouteRow {
  /** Free-form or ISO date string (YYYY-MM-DD). May be empty. */
  date: string
  /** Route description, e.g. "Airport - Hotel". Required when a row is kept. */
  route: string
}

export interface VehicleReportPayload {
  event_code: string
  event_period_text: string
  pax_text: string
  flight_info_text: string
  vehicle_text: string
  hotel_text: string
  guide_text: string
  daily_routes: DailyRouteRow[]
  special_notes: string
}

export const VEHICLE_TEXT_MAX = 300
export const VEHICLE_ROUTE_MAX = 1000
export const VEHICLE_NOTES_MAX = 4000
export const VEHICLE_DATE_MAX = 40
export const VEHICLE_MAX_DAILY_ROUTES = 60

/** Trim + cap a value to a string. Non-strings become ''. */
export function normalizeText(value: unknown, max: number = VEHICLE_TEXT_MAX): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

/**
 * Normalize daily_routes into a clean array of rows. Fully-empty rows (no date
 * AND no route) are dropped. Capped at VEHICLE_MAX_DAILY_ROUTES.
 */
export function normalizeDailyRoutes(input: unknown): DailyRouteRow[] {
  if (!Array.isArray(input)) return []
  const rows: DailyRouteRow[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const date = normalizeText(record.date, VEHICLE_DATE_MAX)
    const route = normalizeText(record.route, VEHICLE_ROUTE_MAX)
    if (!date && !route) continue
    rows.push({ date, route })
    if (rows.length >= VEHICLE_MAX_DAILY_ROUTES) break
  }
  return rows
}

/** Normalize an untrusted payload into a clean VehicleReportPayload (draft-safe). */
export function normalizeVehicleReportPayload(input: unknown): VehicleReportPayload {
  const record = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  return {
    event_code: normalizeText(record.event_code),
    event_period_text: normalizeText(record.event_period_text),
    pax_text: normalizeText(record.pax_text),
    flight_info_text: normalizeText(record.flight_info_text),
    vehicle_text: normalizeText(record.vehicle_text),
    hotel_text: normalizeText(record.hotel_text),
    guide_text: normalizeText(record.guide_text),
    daily_routes: normalizeDailyRoutes(record.daily_routes),
    special_notes: normalizeText(record.special_notes, VEHICLE_NOTES_MAX),
  }
}

export type VehicleReportValidation =
  | { ok: true; payload: VehicleReportPayload }
  | { ok: false; error: string }

/**
 * Validation for FINAL SUBMIT. Drafts have no required fields (just normalized).
 * Submit requires:
 *   - event_code present (the report's only identifier)
 *   - every kept daily route row has route text
 */
export function validateVehicleReportForSubmit(input: unknown): VehicleReportValidation {
  const payload = normalizeVehicleReportPayload(input)

  if (!payload.event_code) {
    return { ok: false, error: '행사코드를 입력해주세요.' }
  }

  const rowMissingRoute = payload.daily_routes.some((row) => !row.route)
  if (rowMissingRoute) {
    return { ok: false, error: '날짜별 동선의 동선 내용을 입력해주세요.' }
  }

  return { ok: true, payload }
}

/** A submitted report is locked — never editable in v1. */
export function isVehicleReportLocked(status: VehicleReportStatus | string | null | undefined): boolean {
  return status === 'submitted'
}
