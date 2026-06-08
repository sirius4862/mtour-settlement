import {
  adminDateRangeQuickUrls,
  ADMIN_DATE_RANGE_ALL_WARNING,
  ADMIN_DATE_RANGE_DEFAULT_NOTICE,
  buildAdminDateRangeHref,
  parseAdminDateRangeSearchParams,
  type AdminDateRangeFilter,
  type AdminDateRangeSearchParams,
} from '@/lib/admin/date-range-filter'
import { filterAdminToursByRegionScope } from '@/lib/guide/assignment'
import type { AdminRegionScope } from '@/lib/region/permissions'
import { deriveVehicleAssignmentStatus, type VehicleAssignmentStatus } from './assignment-status'
import type { VehicleTourReportStatus } from './report-status'

export const VEHICLE_ASSIGNMENT_PATH = '/admin/vehicle-assignments'

export const VEHICLE_ASSIGNMENT_DEFAULT_RANGE_NOTICE = ADMIN_DATE_RANGE_DEFAULT_NOTICE

/** @deprecated Use VEHICLE_ASSIGNMENT_DEFAULT_RANGE_NOTICE */
export const VEHICLE_ASSIGNMENT_CURRENT_MONTH_NOTICE = VEHICLE_ASSIGNMENT_DEFAULT_RANGE_NOTICE

export const VEHICLE_ASSIGNMENT_ALL_RANGE_WARNING = ADMIN_DATE_RANGE_ALL_WARNING

export const VEHICLE_ASSIGNMENT_LIST_LIMIT = 200
export const VEHICLE_ASSIGNMENT_LIST_LIMIT_ALL = 500

export type VehicleAssignmentDateFilter = AdminDateRangeFilter

export type VehicleAssignmentSearchParams = AdminDateRangeSearchParams

export function parseVehicleAssignmentSearchParams(
  params: VehicleAssignmentSearchParams | undefined,
  referenceDate: Date = new Date(),
): VehicleAssignmentDateFilter {
  return parseAdminDateRangeSearchParams(params, referenceDate)
}

export function vehicleAssignmentQuickRangeUrls(referenceDate: Date = new Date()) {
  return adminDateRangeQuickUrls(VEHICLE_ASSIGNMENT_PATH, referenceDate)
}

export function buildVehicleAssignmentListHref(from: string | null, to: string | null): string {
  return buildAdminDateRangeHref(VEHICLE_ASSIGNMENT_PATH, from, to)
}

/** App-layer mirror of the DB start_date range filter. */
export function isTourInVehicleAssignmentDateRange(
  startDate: string | null | undefined,
  filter: VehicleAssignmentDateFilter,
): boolean {
  if (!startDate) return false
  if (filter.range === 'all') return true
  if (filter.from && startDate < filter.from) return false
  if (filter.to && startDate > filter.to) return false
  return true
}

export function filterVehicleAssignmentToursByDateRange<
  T extends { start_date: string | null },
>(tours: T[], filter: VehicleAssignmentDateFilter): T[] {
  return tours.filter((t) => isTourInVehicleAssignmentDateRange(t.start_date, filter))
}

export interface VehicleAssignmentTourRow {
  id: string
  tour_code: string
  start_date: string | null
  end_date: string | null
  branch_id: string
  vehicle_company_profile_id: string | null
  guide_name: string | null
}

export interface VehicleAssignmentTourListItem extends VehicleAssignmentTourRow {
  vehicle_company_name: string | null
  report_status: VehicleTourReportStatus
  assignment_status: VehicleAssignmentStatus
}

/**
 * Map tours (already branch-scoped) to vehicle assignment list items.
 * Report rows are optional enrichment — tours without reports are included.
 */
export function buildVehicleAssignmentTourListItems(
  tours: VehicleAssignmentTourRow[],
  reportByTour: Map<string, VehicleTourReportStatus>,
  vehicleCompanyNameById: Map<string, string>,
): VehicleAssignmentTourListItem[] {
  return tours.map((t) => {
    const profileId = t.vehicle_company_profile_id
    const reportStatus = reportByTour.get(t.id) ?? 'none'
    return {
      ...t,
      vehicle_company_name: profileId ? vehicleCompanyNameById.get(profileId) ?? null : null,
      report_status: reportStatus,
      assignment_status: deriveVehicleAssignmentStatus(!!profileId, reportStatus),
    }
  })
}

/** App-layer branch scope after the tours query (master_admin passes all rows through). */
export function filterVehicleAssignmentToursByScope<T extends { branch_id: string }>(
  tours: T[],
  scope: AdminRegionScope,
): T[] {
  return filterAdminToursByRegionScope(tours, scope)
}
