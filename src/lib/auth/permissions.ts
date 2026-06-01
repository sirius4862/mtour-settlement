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

export function canMasterAdminEditApprovedSettlement(
  status: SettlementStatus,
  role: UserRole,
): boolean {
  return isMasterAdmin(role) && status === 'approved'
}

export function canAdminReviewEditSettlement(
  status: SettlementStatus,
  role: UserRole,
): boolean {
  if (!isAdminTier(role)) return false
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

export function canAdminReviewActions(role: UserRole): boolean {
  return isAdminTier(role)
}

export function assertRoleCanSaveAdminSettlement(
  role: UserRole,
  status: SettlementStatus,
): { ok: true } | { ok: false; error: string } {
  if (!canSaveAdminSettlementEdits(status, role)) {
    if (status === 'paid') {
      return { ok: false, error: '지급 완료된 정산서는 수정할 수 없습니다.' }
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
