// ============================================================================
// Admin vehicle report read-only — pure helpers (no I/O).
// Operational only. Never references settlements, payout, money, or status flow.
// ============================================================================

import type { AdminRegionScope } from '@/lib/region/permissions'
import { assertAdminCanAccessSettlementBranch } from '@/lib/region/settlement-access'
import type { GuideCheckStatus } from './guide-check'
import type { VehicleReportPayload } from './report-validation'
import {
  vehicleDashboardGuideCheckLabel,
  vehicleDashboardIssueNotePreview,
} from './vehicle-dashboard-status'
import type { VehicleTourReportStatus } from './report-status'

export interface AdminVehicleReportGuideCheckSummary {
  check_status: GuideCheckStatus | null
  checked_at: string | null
  issue_note: string | null
}

export interface AdminVehicleReportTourInfo {
  id: string
  tour_code: string
  start_date: string | null
  end_date: string | null
  branch_id: string
  guide_name: string | null
  vehicle_company_name: string | null
}

export interface AdminVehicleReportContent extends VehicleReportPayload {
  id: string
  submitted_at: string | null
  submitted_by_name: string | null
}

export interface AdminVehicleReportGuideCheckDetail {
  check_status: GuideCheckStatus
  issue_note: string | null
  checked_at: string | null
  guide_name: string | null
}

export interface AdminVehicleReportDetailView {
  tour: AdminVehicleReportTourInfo
  report: AdminVehicleReportContent
  guide_check: AdminVehicleReportGuideCheckDetail | null
}

/** App-layer branch gate for admin read-only vehicle report access. */
export function canAdminViewVehicleReportInBranch(
  scope: AdminRegionScope,
  tourBranchId: string | null | undefined,
): boolean {
  return assertAdminCanAccessSettlementBranch(scope, tourBranchId).ok
}

/** List card label for submitted report guide-check state. */
export function adminVehicleReportGuideCheckListLabel(
  reportStatus: VehicleTourReportStatus,
  check: AdminVehicleReportGuideCheckSummary | null | undefined,
): string | null {
  return vehicleDashboardGuideCheckLabel({
    report_status: reportStatus,
    check_status: check?.check_status ?? null,
    issue_note: check?.issue_note,
  })
}

/** Short issue-note preview for assignment list cards. */
export function adminVehicleReportIssueNotePreview(
  note: string | null | undefined,
  maxLength = 80,
): string | null {
  return vehicleDashboardIssueNotePreview(note, maxLength)
}

export function adminVehicleReportDetailHref(tourId: string): string {
  return `/admin/vehicle-reports/${tourId}`
}

/** Detail page guide-check label (submitted reports only). */
export function adminVehicleReportGuideCheckDetailLabel(
  check: AdminVehicleReportGuideCheckDetail | null,
): string {
  if (!check) return '가이드 미확인'
  if (check.check_status === 'no_issue') return '가이드 확인 완료 · 이상없음'
  return '가이드 확인 완료 · 이상있음'
}

export function buildAdminVehicleReportDetailView(input: {
  tour: AdminVehicleReportTourInfo
  report: AdminVehicleReportContent
  guide_check: AdminVehicleReportGuideCheckDetail | null
}): AdminVehicleReportDetailView {
  return {
    tour: input.tour,
    report: input.report,
    guide_check: input.guide_check,
  }
}
