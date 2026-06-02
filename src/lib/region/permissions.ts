import { isMasterAdmin } from '@/lib/auth/permissions'
import type { UserRole } from '@/types'

export interface AdminRegionScope {
  role: UserRole
  /** Assigned region (`profiles.branch_id`) — guides and v1 admins. */
  assignedRegionId: string | null
}

/**
 * Resolve settlement list/dashboard region filter.
 * - master_admin: optional UI filter; undefined = all regions
 * - admin: forced to assigned region when set
 */
export function resolveAdminRegionFilter(
  scope: AdminRegionScope,
  requestedRegionId?: string | null,
): string | undefined {
  if (isMasterAdmin(scope.role)) {
    const id = requestedRegionId?.trim()
    return id || undefined
  }
  return scope.assignedRegionId ?? undefined
}

export function canAdminAccessRegion(
  scope: AdminRegionScope,
  regionId: string | null | undefined,
): boolean {
  if (!regionId) return false
  if (isMasterAdmin(scope.role)) return true
  return scope.assignedRegionId === regionId
}

export function adminRegionScopeLabel(scope: AdminRegionScope): string {
  if (isMasterAdmin(scope.role)) return '전체 지역'
  if (scope.assignedRegionId) return '담당 지역'
  return '지역 미배정'
}
