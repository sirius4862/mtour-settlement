import type { GuideCheckStatus } from './guide-check'
import type { VehicleTourReportStatus } from './report-status'

/** Vehicle company dashboard — report row status (distinct from admin assignment labels). */
export function vehicleDashboardReportStatusLabel(status: VehicleTourReportStatus): string {
  switch (status) {
    case 'submitted':
      return '제출 완료'
    case 'draft':
      return '임시저장'
    case 'none':
    default:
      return '작성 가능'
  }
}

export interface VehicleDashboardGuideCheckInput {
  report_status: VehicleTourReportStatus
  check_status: GuideCheckStatus | null | undefined
  issue_note?: string | null
}

/**
 * Guide check label for submitted reports only.
 * Returns null when the report is not submitted (guide check is N/A on the list).
 */
export function vehicleDashboardGuideCheckLabel(input: VehicleDashboardGuideCheckInput): string | null {
  if (input.report_status !== 'submitted') return null
  if (!input.check_status) return '가이드 미확인'
  if (input.check_status === 'no_issue') return '가이드 확인 완료 · 이상없음'
  return '가이드 확인 완료 · 이상있음'
}

/** Short memo preview for list cards when guide reported an issue. */
export function vehicleDashboardIssueNotePreview(
  note: string | null | undefined,
  maxLength = 80,
): string | null {
  if (!note?.trim()) return null
  const trimmed = note.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength)}…`
}
