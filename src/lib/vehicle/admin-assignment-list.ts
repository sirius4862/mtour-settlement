import { filterAdminToursByRegionScope } from '@/lib/guide/assignment'
import type { AdminRegionScope } from '@/lib/region/permissions'
import { deriveVehicleAssignmentStatus, type VehicleAssignmentStatus } from './assignment-status'
import type { VehicleTourReportStatus } from './report-status'

export const VEHICLE_ASSIGNMENT_CURRENT_MONTH_NOTICE =
  '기본값: 이번 달 투어만 표시됩니다.'

export const VEHICLE_ASSIGNMENT_ALL_RANGE_WARNING =
  '전체 조회는 데이터가 많을 수 있습니다.'

export const VEHICLE_ASSIGNMENT_LIST_LIMIT = 200
export const VEHICLE_ASSIGNMENT_LIST_LIMIT_ALL = 500

export type VehicleAssignmentQuickRange =
  | 'all'
  | 'from_today'
  | 'current_month'
  | 'next_month'
  | 'prev_month'

export interface VehicleAssignmentDateFilter {
  range: VehicleAssignmentQuickRange | 'custom'
  from: string | null
  to: string | null
}

export interface VehicleAssignmentSearchParams {
  from?: string
  to?: string
  range?: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** YYYY-MM-DD in UTC — matches DB date column comparisons used elsewhere in the app. */
export function toUtcDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function currentMonthRange(referenceDate: Date = new Date()): { from: string; to: string } {
  const y = referenceDate.getUTCFullYear()
  const m = referenceDate.getUTCMonth()
  const from = `${y}-${pad2(m + 1)}-01`
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const to = `${y}-${pad2(m + 1)}-${pad2(lastDay)}`
  return { from, to }
}

export function nextMonthRange(referenceDate: Date = new Date()): { from: string; to: string } {
  const anchor = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1))
  return currentMonthRange(anchor)
}

export function prevMonthRange(referenceDate: Date = new Date()): { from: string; to: string } {
  const anchor = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - 1, 1))
  return currentMonthRange(anchor)
}

export function todayUtcString(referenceDate: Date = new Date()): string {
  return toUtcDateString(referenceDate)
}

/**
 * Resolve list filter from URL search params.
 * No params → current calendar month (default for manual testing).
 */
export function parseVehicleAssignmentSearchParams(
  params: VehicleAssignmentSearchParams | undefined,
  referenceDate: Date = new Date(),
): VehicleAssignmentDateFilter {
  if (params?.range === 'all') {
    return { range: 'all', from: null, to: null }
  }

  if (params?.from || params?.to) {
    const today = todayUtcString(referenceDate)
    const from = params.from ?? null
    const to = params.to ?? null
    if (from === today && !to) {
      return { range: 'from_today', from, to: null }
    }
    const current = currentMonthRange(referenceDate)
    if (from === current.from && to === current.to) {
      return { range: 'current_month', from, to }
    }
    const next = nextMonthRange(referenceDate)
    if (from === next.from && to === next.to) {
      return { range: 'next_month', from, to }
    }
    const prev = prevMonthRange(referenceDate)
    if (from === prev.from && to === prev.to) {
      return { range: 'prev_month', from, to }
    }
    return { range: 'custom', from, to }
  }

  const { from, to } = currentMonthRange(referenceDate)
  return { range: 'current_month', from, to }
}

export function vehicleAssignmentQuickRangeUrls(referenceDate: Date = new Date()) {
  const today = todayUtcString(referenceDate)
  const current = currentMonthRange(referenceDate)
  const next = nextMonthRange(referenceDate)
  const prev = prevMonthRange(referenceDate)
  return {
    fromToday: `/admin/vehicle-assignments?from=${today}`,
    currentMonth: `/admin/vehicle-assignments?from=${current.from}&to=${current.to}`,
    nextMonth: `/admin/vehicle-assignments?from=${next.from}&to=${next.to}`,
    prevMonth: `/admin/vehicle-assignments?from=${prev.from}&to=${prev.to}`,
    all: '/admin/vehicle-assignments?range=all',
  } as const
}

export function buildVehicleAssignmentListHref(from: string | null, to: string | null): string {
  const sp = new URLSearchParams()
  if (from) sp.set('from', from)
  if (to) sp.set('to', to)
  const q = sp.toString()
  return q ? `/admin/vehicle-assignments?${q}` : '/admin/vehicle-assignments'
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
