import { canOperationalAdminReview } from '@/lib/auth/permissions'
import type { SettlementStatus, TourAssignmentStatus, UserRole } from '@/types'

/** Canonical settlement status a recalled (배정회수) assignment lands on. */
export const ASSIGNMENT_RECALLED_STATUS: SettlementStatus = 'recalled'

/**
 * Settlement statuses whose tour assignment may still be recalled (배정회수).
 * A wrong guide realistically only reaches 미작성/작성중/제출됨 — never the
 * review/confirm/pay states, which must be handled manually.
 */
export const ASSIGNMENT_RECALL_ELIGIBLE_SETTLEMENT_STATUSES: SettlementStatus[] = [
  'draft',
  'submitted',
]

export interface AssignmentRecallInput {
  /** tours.assignment_status — already-recalled tours can never be recalled again. */
  assignmentStatus: TourAssignmentStatus | null | undefined
  /** Linked settlement status, or null/undefined when no settlement row exists yet. */
  settlementStatus: SettlementStatus | null | undefined
  /** settlement.guide_confirmed_at — any confirmed row is blocked regardless of status. */
  guideConfirmedAt: string | null | undefined
}

/**
 * True when an admin may recall the guide assignment for a tour. Eligible when:
 *   • the tour is not already recalled, AND
 *   • the guide has never confirmed (guide_confirmed_at IS NULL), AND
 *   • no settlement exists (정산서 미작성) OR the settlement is draft/submitted.
 * Region scope is enforced separately at the server action, as for every admin action.
 */
export function isAssignmentRecallEligible(input: AssignmentRecallInput): boolean {
  if (input.assignmentStatus === 'recalled') return false
  if (input.guideConfirmedAt != null) return false
  const status = input.settlementStatus
  if (status == null) return true
  return ASSIGNMENT_RECALL_ELIGIBLE_SETTLEMENT_STATUSES.includes(status)
}

export function assertCanRecallTourAssignment(
  input: AssignmentRecallInput & { role: UserRole },
): { ok: true } | { ok: false; error: string } {
  if (!canOperationalAdminReview(input.role)) {
    return { ok: false, error: '배정 회수는 관리자 권한이 필요합니다.' }
  }
  if (input.assignmentStatus === 'recalled') {
    return { ok: false, error: '이미 배정 회수된 투어입니다.' }
  }
  if (input.guideConfirmedAt != null) {
    return { ok: false, error: '가이드가 최종확인한 정산서는 배정을 회수할 수 없습니다.' }
  }
  const status = input.settlementStatus
  if (status != null && !ASSIGNMENT_RECALL_ELIGIBLE_SETTLEMENT_STATUSES.includes(status)) {
    return { ok: false, error: '미작성·작성중·제출됨 상태에서만 배정을 회수할 수 있습니다.' }
  }
  return { ok: true }
}
