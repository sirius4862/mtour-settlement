import type { Settlement, SettlementStatus, UserRole } from '@/types'

/** Active app roles. Legacy DB enum value `staff` is migrated to `admin`. */
export type ActiveUserRole = 'guide' | 'admin' | 'master_admin'

export function isGuide(role: UserRole): role is 'guide' {
  return role === 'guide'
}

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

export function canMarkSettlementPaid(role: UserRole): boolean {
  return isMasterAdmin(role)
}

/** After approval or payment, admin users are read-only. */
export function isPostApprovalReadOnlyForAdmin(status: SettlementStatus): boolean {
  return status === 'approved' || status === 'paid'
}

/** Pre-payment operational review — admin role only (not master_admin). */
export function canOperationalAdminReview(role: UserRole): boolean {
  return isAdmin(role)
}

export function canMasterAdminEditApprovedSettlement(
  status: SettlementStatus,
  role: UserRole,
): boolean {
  return isMasterAdmin(role) && status === 'approved'
}

export function canMasterApproveFromPending(
  status: SettlementStatus,
  role: UserRole,
): boolean {
  return isMasterAdmin(role) && status === 'pending_guide_confirmation'
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
  return (
    canAdminReviewEditSettlement(status, role) ||
    canMasterAdminEditApprovedSettlement(status, role)
  )
}

/** Pre-payment review actions (reject, send for confirmation, etc.). */
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
      error: '최종확인 완료 또는 지급 완료된 정산서는 조회만 가능합니다.',
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
    if (status === 'approved' && isAdmin(role)) {
      return {
        ok: false,
        error: '최종확인 완료 정산서는 마스터 관리자만 수정할 수 있습니다.',
      }
    }
    return { ok: false, error: '현재 상태에서는 수정할 수 없습니다.' }
  }
  return { ok: true }
}

export function assertRoleCanMarkPaid(
  role: UserRole,
): { ok: true } | { ok: false; error: string } {
  if (!canMarkSettlementPaid(role)) {
    return { ok: false, error: '지급 처리는 마스터 관리자만 할 수 있습니다.' }
  }
  return { ok: true }
}

export function settlementRequiresReconfirmAfterMasterAdminEdit(
  status: SettlementStatus,
  role: UserRole,
): boolean {
  return status === 'approved' && isMasterAdmin(role)
}

export type SettlementPayGuardInput = Pick<
  Settlement,
  'status' | 'guide_confirmed_at' | 'guide_submit_snapshot_id'
>
