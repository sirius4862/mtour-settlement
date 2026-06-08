// ============================================================================
// Vehicle report form — shared field keys + read-only display mapping (no I/O).
// Keeps editable form payload keys aligned with server report record keys.
// ============================================================================

import type { VehicleReportPayload } from './report-validation'

/** Basic-info fields: same snake_case keys for form write and read-only display. */
export const VEHICLE_REPORT_BASIC_INFO_FIELDS = [
  { label: '행사코드', key: 'event_code' },
  { label: '행사기간', key: 'event_period_text' },
  { label: '인원', key: 'pax_text' },
  { label: '항공편', key: 'flight_info_text' },
  { label: '차량', key: 'vehicle_text' },
  { label: '호텔', key: 'hotel_text' },
  { label: '가이드', key: 'guide_text' },
] as const satisfies ReadonlyArray<{
  label: string
  key: keyof Pick<
    VehicleReportPayload,
    | 'event_code'
    | 'event_period_text'
    | 'pax_text'
    | 'flight_info_text'
    | 'vehicle_text'
    | 'hotel_text'
    | 'guide_text'
  >
}>

export type VehicleReportBasicInfoKey = (typeof VEHICLE_REPORT_BASIC_INFO_FIELDS)[number]['key']

/** Build the server-action payload from editable form state. */
export function buildVehicleReportFormPayload(input: VehicleReportPayload): VehicleReportPayload {
  return {
    event_code: input.event_code,
    event_period_text: input.event_period_text,
    pax_text: input.pax_text,
    flight_info_text: input.flight_info_text,
    vehicle_text: input.vehicle_text,
    hotel_text: input.hotel_text,
    guide_text: input.guide_text,
    daily_routes: input.daily_routes,
    special_notes: input.special_notes,
  }
}

/** Read-only display values — always sourced from the saved server report. */
export function vehicleReportReadOnlyValues(report: VehicleReportPayload): VehicleReportPayload {
  return buildVehicleReportFormPayload(report)
}
