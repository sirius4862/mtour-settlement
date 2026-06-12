import {
  assertAdminReadOnlyAfterApproval,
  assertRoleCanMarkPaid,
  assertRoleCanSaveAdminSettlement,
  canMarkSettlementPaid,
  canMasterReopenPaid,
  canOperationalAdminReview,
  canSaveAdminSettlementEdits,
  isAdminTier,
  isMasterAdmin,
  type SettlementPayGuardInput,
} from '@/lib/auth/permissions'
import type { Settlement, SettlementStatus, UserRole } from '@/types'

/** Guide may edit settlement content */
export const GUIDE_EDITABLE: SettlementStatus[] = ['draft', 'rejected', 'edit_requested']

/** Guide may only confirm or request edit (read-only form) */
export const GUIDE_CONFIRM_ONLY: SettlementStatus[] = ['pending_guide_confirmation']

/** Admin may edit admin-owned fields during pre-confirm review */
export const ADMIN_EDITABLE: SettlementStatus[] = ['submitted', 'clarification_requested']

/** @deprecated v1 — no master post-confirm edit path */
export const MASTER_ADMIN_EDITABLE: SettlementStatus[] = []

/** Admin may request guide content edit (pre-confirmation) */
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
  s: Pick<Settlement, 'status' | 'guide_id' | 'guide_confirmed_at'>,
  uid: string,
): boolean {
  return (
    s.guide_id === uid &&
    s.status === 'pending_guide_confirmation' &&
    s.guide_confirmed_at == null
  )
}

export function canGuideRequestClarification(
  s: Pick<Settlement, 'status' | 'guide_id' | 'guide_confirmed_at'>,
  uid: string,
): boolean {
  return canGuideConfirm(s, uid)
}

/**
 * Detects the desynced confirmation state: the guide is still prompted to
 * confirm (pending_guide_confirmation, guide_confirmed_at IS NULL) but no usable
 * *pending* confirmation packet exists, so /confirm cannot render its buttons.
 * Happens e.g. when the linked settlement_confirmations row was marked 'confirmed'
 * while settlements.guide_confirmed_at was never written (see tour 260426).
 */
export function isStuckGuideConfirmation(
  s: Pick<Settlement, 'status' | 'guide_confirmed_at' | 'active_confirmation_id'>,
  linkedConfirmationStatus: string | null,
): boolean {
  if (s.status !== 'pending_guide_confirmation') return false
  if (s.guide_confirmed_at != null) return false
  return s.active_confirmation_id == null || linkedConfirmationStatus !== 'pending'
}

export function canAdminEditSettlement(status: SettlementStatus): boolean {
  return ADMIN_EDITABLE.includes(status)
}

export function canMasterAdminEditSettlement(_status: SettlementStatus): boolean {
  return false
}

export function canAdminOrMasterAdminEditSettlement(
  status: SettlementStatus,
  role: UserRole,
): boolean {
  return canSaveAdminSettlementEdits(status, role)
}

/** @deprecated v1 — guide confirmation replaces admin/master direct approve. */
export function canAdminDirectApprove(_status: SettlementStatus): boolean {
  return false
}

/** @deprecated v1 — use 수정요청 instead of 반려. */
export function canAdminReject(_status: SettlementStatus, role?: UserRole): boolean {
  if (role !== undefined && !canOperationalAdminReview(role)) return false
  return false
}

export interface AdminRequestEditInput {
  status: SettlementStatus
  guide_confirmed_at?: string | null
  guide_submit_snapshot_id?: string | null
}

/** Admin may request guide correction before payment (submitted) or after guide final confirmation (unpaid). */
export function canAdminRequestEditOnSettlement(
  s: AdminRequestEditInput,
  role?: UserRole,
): boolean {
  if (role !== undefined && !canOperationalAdminReview(role)) return false
  if (ADMIN_PRE_CONFIRM_REVIEW.includes(s.status)) return true
  return isGuideFinalConfirmedSettlement({
    status: s.status,
    guide_confirmed_at: s.guide_confirmed_at ?? null,
    guide_submit_snapshot_id: s.guide_submit_snapshot_id ?? null,
  })
}

export function canAdminRequestEdit(status: SettlementStatus, role?: UserRole): boolean {
  return canAdminRequestEditOnSettlement({ status }, role)
}

/** Admin sends guide the confirmation packet after review/edit. */
export function canAdminSendForConfirmation(status: SettlementStatus, role?: UserRole): boolean {
  if (role !== undefined && !canOperationalAdminReview(role)) return false
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
    return { ok: false, error: '최종확인 상태에서만 처리할 수 있습니다.' }
  }
  if (action === 'clarification') return { ok: true }
  return { ok: true }
}

export function assertAdminSendForConfirmation(
  status: SettlementStatus,
  guideSubmitSnapshotId: string | null,
): { ok: true } | { ok: false; error: string } {
  if (!canAdminSendForConfirmation(status)) {
    return { ok: false, error: '제출됨 상태에서만 최종확인을 보낼 수 있습니다.' }
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
 * Pay from 최종확인 after guide confirmation.
 * Legacy `approved` rows remain payable for migration.
 */
export function canAdminPaySettlement(s: SettlementPayGuardInput): boolean {
  if (s.status === 'pending_guide_confirmation') {
    return s.guide_confirmed_at != null
  }
  if (s.status === 'approved') {
    if (s.guide_submit_snapshot_id && !s.guide_confirmed_at) return false
    return true
  }
  return false
}

export function canMarkSettlementPaidForRole(
  role: UserRole,
  s: SettlementPayGuardInput,
): boolean {
  return canMarkSettlementPaid(role) && canAdminPaySettlement(s)
}

/**
 * Settlement recall (회수) is not offered once a guide request is in flight.
 * After admin sends 수정요청 or 최종확인, the guide must respond via the normal flow.
 * Assignment recall (배정회수) is a separate tour-level action.
 */
export const RECALL_ELIGIBLE_STATUSES: SettlementStatus[] = []

/**
 * Recall returns the settlement to this existing admin-editable status.
 * `submitted` is admin-editable (ADMIN_EDITABLE) and NOT guide-actionable
 * (guide cannot edit/confirm it), so the recalled row leaves the guide's
 * 최종확인/수정요청 lists while preserving every field value.
 * Note: `draft` is unsuitable as a target because it is guide-editable here.
 */
export const RECALL_TARGET_STATUS: SettlementStatus = 'submitted'

/** Master-admin reopen from paid (지급완료) → admin review for correction. */
export const FINAL_CONFIRMED_REOPEN_TARGET_STATUS: SettlementStatus = 'submitted'

export interface SettlementRecallGuardInput {
  status: SettlementStatus
  guide_confirmed_at: string | null
}

export interface SettlementFinalConfirmedInput {
  status: SettlementStatus
  guide_confirmed_at: string | null
  guide_submit_snapshot_id?: string | null
}

/** Guide completed final confirmation (지급가능) — pending_guide_confirmation+confirmed or legacy approved. */
export function isGuideFinalConfirmedSettlement(s: SettlementFinalConfirmedInput): boolean {
  if (s.status === 'pending_guide_confirmation' && s.guide_confirmed_at != null) {
    return true
  }
  if (s.status === 'approved') {
    if (s.guide_submit_snapshot_id && !s.guide_confirmed_at) return false
    return true
  }
  return false
}

/** Master admin may reopen a paid-completed (지급완료) settlement for admin correction. */
export function canMasterReopenFinalConfirmed(
  s: SettlementFinalConfirmedInput,
  role: UserRole,
): boolean {
  if (!isMasterAdmin(role)) return false
  return s.status === 'paid'
}

export function assertCanMasterReopenFinalConfirmed(
  s: SettlementFinalConfirmedInput,
  role: UserRole,
): { ok: true } | { ok: false; error: string } {
  if (!isMasterAdmin(role)) {
    return { ok: false, error: '정산 재오픈은 마스터 관리자만 할 수 있습니다.' }
  }
  if (s.status !== 'paid') {
    return { ok: false, error: '지급 완료된 정산서만 정산 재오픈할 수 있습니다.' }
  }
  return { ok: true }
}

/**
 * Generic settlement recall (회수) on admin detail — disabled for all statuses.
 * Guides may never recall. Region scope (admin) is enforced separately when used.
 */
export function canRecallSettlement(
  s: SettlementRecallGuardInput,
  role: UserRole,
): boolean {
  if (!canOperationalAdminReview(role)) return false
  if (isGuideFinalConfirmedSettlement(s)) return false
  if (!RECALL_ELIGIBLE_STATUSES.includes(s.status)) return false
  if (s.status === 'pending_guide_confirmation' && s.guide_confirmed_at != null) {
    return false
  }
  return true
}

export function assertCanRecallSettlement(
  s: SettlementRecallGuardInput,
  role: UserRole,
): { ok: true } | { ok: false; error: string } {
  if (!canOperationalAdminReview(role)) {
    return { ok: false, error: '회수는 관리자 권한이 필요합니다.' }
  }
  if (s.status === 'paid') {
    return { ok: false, error: '지급 완료된 정산서는 회수할 수 없습니다.' }
  }
  if (s.status === 'pending_guide_confirmation' && s.guide_confirmed_at != null) {
    return { ok: false, error: '가이드가 이미 최종확인한 정산서는 회수할 수 없습니다.' }
  }
  if (!canRecallSettlement(s, role)) {
    return { ok: false, error: '현재 상태에서는 회수할 수 없습니다.' }
  }
  return { ok: true }
}

export type AdminReviewAction = 'approve' | 'reject' | 'request_edit' | 'pay' | 'reopen'

export function assertAdminReviewAction(
  s: SettlementPayGuardInput,
  action: AdminReviewAction,
  role: UserRole,
): { ok: true } | { ok: false; error: string } {
  const readOnly = assertAdminReadOnlyAfterApproval(role, s.status)
  if (!readOnly.ok && action !== 'reopen') {
    return readOnly
  }

  switch (action) {
    case 'approve':
      return { ok: false, error: '최종 승인은 더 이상 사용하지 않습니다. 지급완료 처리를 사용하세요.' }
    case 'reject':
      return { ok: false, error: '반려는 더 이상 사용하지 않습니다. 수정요청을 사용하세요.' }
    case 'reopen':
      if (!canMasterReopenPaid(s.status, role)) {
        return { ok: false, error: '지급 완료 정산서 재오픈은 마스터 관리자만 할 수 있습니다.' }
      }
      return { ok: true }
    case 'request_edit':
      if (!canOperationalAdminReview(role)) {
        return { ok: false, error: '관리자 권한이 필요합니다.' }
      }
      if (!canAdminRequestEditOnSettlement(s, role)) {
        return { ok: false, error: '현재 상태에서는 수정요청을 할 수 없습니다.' }
      }
      return { ok: true }
    case 'pay': {
      const roleGuard = assertRoleCanMarkPaid(role)
      if (!roleGuard.ok) return roleGuard
      if (!canAdminPaySettlement(s)) {
        if (s.status !== 'pending_guide_confirmation' && s.status !== 'approved') {
          return { ok: false, error: '최종확인 상태에서만 지급 처리할 수 있습니다.' }
        }
        return { ok: false, error: '가이드 최종확인(이상없음) 후에만 지급 처리할 수 있습니다.' }
      }
      return { ok: true }
    }
    default:
      return { ok: false, error: '지원하지 않는 작업입니다.' }
  }
}

/** Returned when an optimistic status-conditioned update affects zero or multiple rows. */
export const SETTLEMENT_STATUS_STALE_ERROR =
  '상태가 이미 변경되었습니다. 새로고침 후 다시 시도해주세요.'

/** Friendly message when settlements_tour_id_key (UNIQUE tour_id) rejects a second insert. */
export const SETTLEMENT_DUPLICATE_TOUR_ERROR =
  '이 투어에는 이미 정산서가 있습니다. 기존 정산서를 열어주세요.'

export function isPgUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505'
}

export function assertSingleOptimisticUpdate(
  rows: { id: string }[] | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!rows || rows.length !== 1) {
    return { ok: false, error: SETTLEMENT_STATUS_STALE_ERROR }
  }
  return { ok: true }
}

export {
  canMasterAdminEditApprovedSettlement,
  canMarkSettlementPaid,
  isAdminTier,
  settlementRequiresReconfirmAfterMasterAdminEdit,
} from '@/lib/auth/permissions'
