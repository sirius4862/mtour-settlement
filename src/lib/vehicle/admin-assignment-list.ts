import { filterAdminToursByRegionScope } from '@/lib/guide/assignment'
import type { AdminRegionScope } from '@/lib/region/permissions'
import { deriveVehicleAssignmentStatus, type VehicleAssignmentStatus } from './assignment-status'
import type { VehicleTourReportStatus } from './report-status'

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
