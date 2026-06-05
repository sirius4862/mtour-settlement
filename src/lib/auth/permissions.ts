import type { Settlement, SettlementStatus, UserRole } from '@/types'

/** Active app roles. Legacy DB enum value `staff` is migrated to `admin`. */
export type ActiveUserRole = 'guide' | 'admin' | 'master_admin'

export function isGuide(role: UserRole): role is 'guide' {
  return role === 'guide'
}

/** Plain `admin` role — use only to distinguish staff admin from master_admin (e.g. post-payment read-only). */
export function isAdmin(role: UserRole): role is 'admin' {
  return role === 'admin'
}

export function isMasterAdmin(role: UserRole): role is 'master_admin' {
  return role === 'master_admin'
}

/** Admin review routes — admin and master_admin. */
export function isAdminTier(role: UserRole): role is 'admin' | 'master_admin' {
  return role === 'admin' || role === 'master_admin'
}

export function homePathForRole(role: UserRole): '/guide' | '/admin' {
  return isAdminTier(role) ? '/admin' : '/guide'
}

export function canAccessGuideRoutes(role: UserRole): boolean {
  return isGuide(role)
}

export function canAccessAdminRoutes(role: UserRole): boolean {
  return isAdminTier(role)
}

export function canPerformGuideMutation(role: UserRole): boolean {
  return isGuide(role)
}

/**
 * Admin tier (admin + master_admin) may mark 지급완료.
 * Guides may never pay. Region scope (admin) and the post-payment edit lock are
 * enforced separately (requireAdminSettlementRegionAccess + DB/RLS paid lock).
 */
export function canMarkSettlementPaid(role: UserRole): boolean {
  return isAdminTier(role)
}

/** After payment, plain admin users are read-only. */
export function isPostApprovalReadOnlyForAdmin(status: SettlementStatus): boolean {
  return status === 'paid'
}

/** Pre-payment operational review — admin tier (admin + master_admin). */
export function canOperationalAdminReview(role: UserRole): boolean {
  return isAdminTier(role)
}

/** @deprecated v1 — no separate approved status or master post-confirm edits. */
export function canMasterAdminEditApprovedSettlement(
  _status: SettlementStatus,
  _role: UserRole,
): boolean {
  return false
}

/** @deprecated v1 — guide confirmation replaces master approve. */
export function canMasterApproveFromPending(
  _status: SettlementStatus,
  _role: UserRole,
): boolean {
  return false
}

export function canMasterReopenPaid(status: SettlementStatus, role: UserRole): boolean {
  return isMasterAdmin(role) && status === 'paid'
}

export function canAdminReviewEditSettlement(
  status: SettlementStatus,
  role: UserRole,
): boolean {
  if (!canOperationalAdminReview(role)) return false
  return status === 'submitted' || status === 'clarification_requested'
}

export function canSaveAdminSettlementEdits(
  status: SettlementStatus,
  role: UserRole,
): boolean {
  return canAdminReviewEditSettlement(status, role)
}

/** Pre-payment review actions (request edit, send for confirmation, pay). */
export function canAdminReviewActions(role: UserRole): boolean {
  return canOperationalAdminReview(role)
}

export function assertAdminReadOnlyAfterApproval(
  role: UserRole,
  status: SettlementStatus,
): { ok: true } | { ok: false; error: string } {
  if (isAdmin(role) && isPostApprovalReadOnlyForAdmin(status)) {
    return {
      ok: false,
      error: '지급 완료된 정산서는 조회만 가능합니다.',
    }
  }
  return { ok: true }
}

export function assertRoleCanSaveAdminSettlement(
  role: UserRole,
  status: SettlementStatus,
): { ok: true } | { ok: false; error: string } {
  const readOnly = assertAdminReadOnlyAfterApproval(role, status)
  if (!readOnly.ok) return readOnly

  if (!canSaveAdminSettlementEdits(status, role)) {
    if (status === 'paid') {
      return { ok: false, error: '지급 완료된 정산서는 수정할 수 없습니다. 마스터 관리자가 재오픈해야 합니다.' }
    }
    return { ok: false, error: '현재 상태에서는 수정할 수 없습니다.' }
  }
  return { ok: true }
}

export function assertRoleCanMarkPaid(
  role: UserRole,
): { ok: true } | { ok: false; error: string } {
  if (!canMarkSettlementPaid(role)) {
    return { ok: false, error: '지급 처리는 관리자 권한이 필요합니다.' }
  }
  return { ok: true }
}

/** @deprecated v1 — confirmation flags on pending_guide_confirmation replace re-confirm flow. */
export function settlementRequiresReconfirmAfterMasterAdminEdit(
  _status: SettlementStatus,
  _role: UserRole,
): boolean {
  return false
}

export type SettlementPayGuardInput = Pick<
  Settlement,
  'status' | 'guide_confirmed_at' | 'guide_submit_snapshot_id'
>
