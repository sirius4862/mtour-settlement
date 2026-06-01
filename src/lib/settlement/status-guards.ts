import {
  assertRoleCanMarkPaid,
  assertRoleCanSaveAdminSettlement,
  canMarkSettlementPaid,
  canMasterAdminEditApprovedSettlement,
  canSaveAdminSettlementEdits,
  isAdminTier,
  type SettlementPayGuardInput,
} from '@/lib/auth/permissions'
import type { Settlement, SettlementStatus, UserRole } from '@/types'

/** Guide may edit settlement content */
export const GUIDE_EDITABLE: SettlementStatus[] = ['draft', 'rejected', 'edit_requested']

/** Guide may only confirm or request clarification (read-only form) */
export const GUIDE_CONFIRM_ONLY: SettlementStatus[] = ['pending_guide_confirmation']

/** Admin may edit admin-owned fields during pre-confirm review */
export const ADMIN_EDITABLE: SettlementStatus[] = ['submitted', 'clarification_requested']

/** Master admin may edit after guide confirmation (not after payment) */
export const MASTER_ADMIN_EDITABLE: SettlementStatus[] = ['approved']

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

export function canMasterAdminEditSettlement(status: SettlementStatus): boolean {
  return MASTER_ADMIN_EDITABLE.includes(status)
}

export function canAdminOrMasterAdminEditSettlement(
  status: SettlementStatus,
  role: UserRole,
): boolean {
  return canSaveAdminSettlementEdits(status, role)
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

/** Admin sends guide the confirmation packet after review/edit. */
export function canAdminSendForConfirmation(status: SettlementStatus): boolean {
  return status === 'submitted' || status === 'clarification_requested'
}

export function assertGuideConfirmAction(
  s: Pick<Settlement, 'status' | 'guide_id'>,
  uid: string,
  action: 'confirm' | 'clarification',
): { ok: true } | { ok: false; error: string } {
  if (s.guide_id !== uid) {
    return { ok: false, error: '본인에게 배정된 정산서만 처리할 수 있습니다.' }
  }
  if (s.status !== 'pending_guide_confirmation') {
    return { ok: false, error: '최종 확인 대기 상태에서만 처리할 수 있습니다.' }
  }
  if (action === 'clarification') return { ok: true }
  return { ok: true }
}

export function assertAdminSendForConfirmation(
  status: SettlementStatus,
  guideSubmitSnapshotId: string | null,
): { ok: true } | { ok: false; error: string } {
  if (!canAdminSendForConfirmation(status)) {
    return { ok: false, error: '제출됨 또는 확인 이의 상태에서만 확인 요청을 보낼 수 있습니다.' }
  }
  if (!guideSubmitSnapshotId) {
    return { ok: false, error: '가이드 제출 스냅샷이 없습니다. 가이드가 다시 제출해야 합니다.' }
  }
  return { ok: true }
}

export function assertAdminSaveSettlement(
  role: UserRole,
  status: SettlementStatus,
): { ok: true } | { ok: false; error: string } {
  return assertRoleCanSaveAdminSettlement(role, status)
}

/**
 * Pay only after guide final confirmation in the new workflow.
 * Legacy `approved` rows (no guide_submit_snapshot_id) remain payable.
 */
export function canAdminPaySettlement(s: SettlementPayGuardInput): boolean {
  if (s.status !== 'approved') return false
  if (s.guide_submit_snapshot_id && !s.guide_confirmed_at) return false
  return true
}

export function canMarkSettlementPaidForRole(
  role: UserRole,
  s: SettlementPayGuardInput,
): boolean {
  return canMarkSettlementPaid(role) && canAdminPaySettlement(s)
}

export type AdminReviewAction = 'approve' | 'reject' | 'request_edit' | 'pay'

export function assertAdminReviewAction(
  s: SettlementPayGuardInput,
  action: AdminReviewAction,
  role: UserRole,
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
    case 'pay': {
      const roleGuard = assertRoleCanMarkPaid(role)
      if (!roleGuard.ok) return roleGuard
      if (!canAdminPaySettlement(s)) {
        if (s.status !== 'approved') {
          return { ok: false, error: '승인된 정산서만 지급 처리할 수 있습니다.' }
        }
        return { ok: false, error: '가이드 최종 확인 후에만 지급 처리할 수 있습니다.' }
      }
      return { ok: true }
    }
    default:
      return { ok: false, error: '지원하지 않는 작업입니다.' }
  }
}

export {
  canMasterAdminEditApprovedSettlement,
  canMarkSettlementPaid,
  isAdminTier,
  settlementRequiresReconfirmAfterMasterAdminEdit,
} from '@/lib/auth/permissions'
