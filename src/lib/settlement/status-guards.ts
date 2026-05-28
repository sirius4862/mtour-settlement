import type { Settlement, SettlementStatus } from '@/types'

/** Guide may edit settlement content */
export const GUIDE_EDITABLE: SettlementStatus[] = ['draft', 'rejected', 'edit_requested']

/** Guide may only confirm or request clarification (read-only form) */
export const GUIDE_CONFIRM_ONLY: SettlementStatus[] = ['pending_guide_confirmation']

/** Admin may edit admin-owned fields (Phase B save action) */
export const ADMIN_EDITABLE: SettlementStatus[] = ['submitted', 'clarification_requested']

/** Admin may reject or request guide content edit (pre-confirmation) */
export const ADMIN_PRE_CONFIRM_REVIEW: SettlementStatus[] = ['submitted', 'clarification_requested']

/** Fully locked for guide */
export const GUIDE_READ_ONLY: SettlementStatus[] = [
  'submitted',
  'pending_guide_confirmation',
  'clarification_requested',
  'approved',
  'paid',
]

export function canGuideEdit(
  s: Pick<Settlement, 'status' | 'guide_id'>,
  uid: string,
): boolean {
  return s.guide_id === uid && GUIDE_EDITABLE.includes(s.status)
}

export function canGuideConfirm(
  s: Pick<Settlement, 'status' | 'guide_id'>,
  uid: string,
): boolean {
  return s.guide_id === uid && s.status === 'pending_guide_confirmation'
}

export function canGuideRequestClarification(
  s: Pick<Settlement, 'status' | 'guide_id'>,
  uid: string,
): boolean {
  return canGuideConfirm(s, uid)
}

export function canAdminEditSettlement(status: SettlementStatus): boolean {
  return ADMIN_EDITABLE.includes(status)
}

/**
 * Admin direct approve is replaced by guide final confirmation.
 * Legacy rows already `approved` in DB are unchanged.
 */
export function canAdminDirectApprove(_status: SettlementStatus): boolean {
  return false
}

export function canAdminReject(status: SettlementStatus): boolean {
  return ADMIN_PRE_CONFIRM_REVIEW.includes(status)
}

export function canAdminRequestEdit(status: SettlementStatus): boolean {
  return ADMIN_PRE_CONFIRM_REVIEW.includes(status)
}

/**
 * Pay only after guide final confirmation in the new workflow.
 * Legacy `approved` rows (no guide_submit_snapshot_id) remain payable.
 */
export function canAdminPaySettlement(
  s: Pick<Settlement, 'status' | 'guide_confirmed_at' | 'guide_submit_snapshot_id'>,
): boolean {
  if (s.status !== 'approved') return false
  if (s.guide_submit_snapshot_id && !s.guide_confirmed_at) return false
  return true
}

export type AdminReviewAction = 'approve' | 'reject' | 'request_edit' | 'pay'

export function assertAdminReviewAction(
  s: Pick<Settlement, 'status' | 'guide_confirmed_at' | 'guide_submit_snapshot_id'>,
  action: AdminReviewAction,
): { ok: true } | { ok: false; error: string } {
  switch (action) {
    case 'approve':
      if (!canAdminDirectApprove(s.status)) {
        return {
          ok: false,
          error: '관리자 직접 승인은 사용할 수 없습니다. 가이드 최종 확인 워크플로(Phase B)를 사용하세요.',
        }
      }
      return { ok: true }
    case 'reject':
      if (!canAdminReject(s.status)) {
        return { ok: false, error: '현재 상태에서는 반려할 수 없습니다.' }
      }
      return { ok: true }
    case 'request_edit':
      if (!canAdminRequestEdit(s.status)) {
        return { ok: false, error: '현재 상태에서는 수정 요청을 할 수 없습니다.' }
      }
      return { ok: true }
    case 'pay':
      if (!canAdminPaySettlement(s)) {
        if (s.status !== 'approved') {
          return { ok: false, error: '승인된 정산서만 지급 처리할 수 있습니다.' }
        }
        return { ok: false, error: '가이드 최종 확인 후에만 지급 처리할 수 있습니다.' }
      }
      return { ok: true }
    default:
      return { ok: false, error: '지원하지 않는 작업입니다.' }
  }
}
