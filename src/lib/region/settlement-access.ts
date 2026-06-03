import { isAdminTier } from '@/lib/auth/permissions'
import type { UserRole } from '@/types'
import { canAdminAccessRegion, type AdminRegionScope } from './permissions'

export const ADMIN_SETTLEMENT_REGION_DENIED = '담당 지역 밖의 정산서입니다.'

/** When true, admin-tier reads must pass settlements.branch_id region check. */
export function shouldApplyAdminSettlementRegionGate(
  callerRole: UserRole | null | undefined,
  audience?: 'guide' | 'admin',
): boolean {
  if (audience === 'guide') return false
  if (!callerRole || !isAdminTier(callerRole)) return false
  return true
}

/**
 * Region gate for admin settlement access — uses settlement operating branch only.
 * Never uses guide profile branch_id.
 */
export function assertAdminCanAccessSettlementBranch(
  scope: AdminRegionScope,
  settlementBranchId: string | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!settlementBranchId?.trim()) {
    return { ok: false, error: '정산서 지역 정보가 없습니다.' }
  }
  if (!canAdminAccessRegion(scope, settlementBranchId)) {
    return { ok: false, error: ADMIN_SETTLEMENT_REGION_DENIED }
  }
  return { ok: true }
}

/** Result for getSettlementFull — deny returns null (same as not found). */
export function evaluateAdminSettlementReadAccess(params: {
  scope: AdminRegionScope | null
  settlementBranchId: string | null | undefined
  callerRole: UserRole | null | undefined
  audience?: 'guide' | 'admin'
}): 'allow' | 'deny' {
  if (!shouldApplyAdminSettlementRegionGate(params.callerRole, params.audience)) {
    return 'allow'
  }
  if (!params.scope) return 'deny'
  return assertAdminCanAccessSettlementBranch(params.scope, params.settlementBranchId).ok
    ? 'allow'
    : 'deny'
}
