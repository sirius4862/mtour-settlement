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
import type { GuideCheckStatus } from '@/lib/vehicle/guide-check'

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

// ============================================================================
// Admin assignment-page status dashboard — three independent axes per tour.
// Pure label/derivation only (no I/O). These intentionally split the combined
// `VehicleAssignmentStatus` into separate badges so admins can scan each axis:
//   1) assignment   미배정 / 배정완료
//   2) vehicle report 리포트 미작성 / 작성중 / 제출완료
//   3) guide check   가이드 미확인 / 이상없음 / 이상있음 (submitted reports only)
// These never reference settlements/payout/money or any write logic.
// ============================================================================

export type VehicleAssignmentAssignedBadge = '미배정' | '배정완료'
export type VehicleAssignmentReportBadge = '리포트 미작성' | '작성중' | '제출완료'
export type VehicleAssignmentGuideCheckBadge = '가이드 미확인' | '이상없음' | '이상있음'

export function vehicleAssignmentAssignedBadgeLabel(
  hasVehicleCompany: boolean,
): VehicleAssignmentAssignedBadge {
  return hasVehicleCompany ? '배정완료' : '미배정'
}

export function vehicleAssignmentReportBadgeLabel(
  status: VehicleTourReportStatus,
): VehicleAssignmentReportBadge {
  switch (status) {
    case 'submitted':
      return '제출완료'
    case 'draft':
      return '작성중'
    case 'none':
    default:
      return '리포트 미작성'
  }
}

/**
 * Guide-check badge for the admin assignment dashboard. Guide checks only exist
 * for submitted reports, so this returns null for none/draft (no badge shown).
 *   - no check row → 가이드 미확인
 *   - no_issue     → 이상없음
 *   - issue_reported → 이상있음
 */
export function vehicleAssignmentGuideCheckBadgeLabel(
  reportStatus: VehicleTourReportStatus,
  checkStatus: GuideCheckStatus | null | undefined,
): VehicleAssignmentGuideCheckBadge | null {
  if (reportStatus !== 'submitted') return null
  if (checkStatus === 'issue_reported') return '이상있음'
  if (checkStatus === 'no_issue') return '이상없음'
  return '가이드 미확인'
}

/** True only when a submitted report has a guide-reported issue (warning style). */
export function isVehicleAssignmentGuideCheckIssue(
  reportStatus: VehicleTourReportStatus,
  checkStatus: GuideCheckStatus | null | undefined,
): boolean {
  return reportStatus === 'submitted' && checkStatus === 'issue_reported'
}
