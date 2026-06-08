import {
  adminDateRangeQuickUrls,
  ADMIN_DATE_RANGE_ALL_WARNING,
  buildAdminDateRangeHref,
  parseAdminDateRangeSearchParams,
  type AdminDateRangeFilter,
  type AdminDateRangeSearchParams,
} from '@/lib/admin/date-range-filter'

export const VEHICLE_DASHBOARD_PATH = '/vehicle'

export const VEHICLE_DASHBOARD_DEFAULT_RANGE_NOTICE =
  '기본값: 오늘부터 7일간 배정 행사만 표시됩니다.'

/** @deprecated Use VEHICLE_DASHBOARD_DEFAULT_RANGE_NOTICE */
export const VEHICLE_DASHBOARD_CURRENT_MONTH_NOTICE = VEHICLE_DASHBOARD_DEFAULT_RANGE_NOTICE

export { ADMIN_DATE_RANGE_ALL_WARNING as VEHICLE_DASHBOARD_ALL_RANGE_WARNING }

export type { AdminDateRangeFilter as VehicleDashboardDateFilter }

export type VehicleDashboardSearchParams = AdminDateRangeSearchParams

export function parseVehicleDashboardSearchParams(
  params: VehicleDashboardSearchParams | undefined,
  referenceDate: Date = new Date(),
): AdminDateRangeFilter {
  return parseAdminDateRangeSearchParams(params, referenceDate)
}

export function vehicleDashboardQuickRangeUrls(referenceDate: Date = new Date()) {
  return adminDateRangeQuickUrls(VEHICLE_DASHBOARD_PATH, referenceDate)
}

export function buildVehicleDashboardHref(from: string | null, to: string | null): string {
  return buildAdminDateRangeHref(VEHICLE_DASHBOARD_PATH, from, to)
}
