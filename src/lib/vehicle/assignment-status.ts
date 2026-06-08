// ============================================================================
// Admin vehicle-assignment status — pure derivation/label helpers (no I/O).
// Admin assignment-page status is intentionally simple and operational:
//   unassigned → 배정 안됨   (no vehicle company on the tour)
//   assigned   → 배정됨      (company assigned, no report yet)
//   draft      → 작성중      (company assigned, draft report exists)
//   submitted  → 제출완료    (submitted report exists)
// This module NEVER references settlement/payout/money/status logic.
// ============================================================================

import type { VehicleTourReportStatus } from '@/lib/vehicle/report-status'

export type VehicleAssignmentStatus = 'unassigned' | 'assigned' | 'draft' | 'submitted'

export function deriveVehicleAssignmentStatus(
  hasVehicleCompany: boolean,
  reportStatus: VehicleTourReportStatus,
): VehicleAssignmentStatus {
  if (!hasVehicleCompany) return 'unassigned'
  if (reportStatus === 'submitted') return 'submitted'
  if (reportStatus === 'draft') return 'draft'
  return 'assigned'
}

export function vehicleAssignmentStatusLabel(status: VehicleAssignmentStatus): string {
  switch (status) {
    case 'submitted':
      return '제출완료'
    case 'draft':
      return '작성중'
    case 'assigned':
      return '배정됨'
    case 'unassigned':
    default:
      return '배정 안됨'
  }
}

/**
 * Admin may manually assign/clear/change a tour's vehicle company ONLY while no
 * vehicle report exists. Once any report (draft or submitted) exists, the
 * assignment can only be reset through the guide assignment-recall cleanup flow.
 */
export function canChangeVehicleAssignment(reportStatus: VehicleTourReportStatus): boolean {
  return reportStatus === 'none'
}

export const VEHICLE_ASSIGNMENT_LOCKED_MESSAGE =
  '이미 차량 리포트가 작성되어 배정을 변경할 수 없습니다. 배정회수를 통해 초기화해야 합니다.'
