import { isMasterAdmin } from '@/lib/auth/permissions'
import { canAdminAccessRegion, type AdminRegionScope } from '@/lib/region/permissions'
import type { Tour } from '@/types'

/** Active guides eligible for tour assignment (home branch is display-only). */
export interface GuideAssignmentCandidate {
  id: string
  role: string
  is_active: boolean
  branch_id: string | null
}

/**
 * Guide picker for admin tour creation — not filtered by admin region or tour region.
 * Admin region scope applies to the tour's operating `branch_id`, not guide home branch.
 */
export function filterGuidesForTourAssignment<T extends GuideAssignmentCandidate>(
  guides: T[],
): T[] {
  return guides.filter((g) => g.role === 'guide' && g.is_active)
}

export function filterAdminToursByRegionScope<T extends Pick<Tour, 'branch_id'>>(
  tours: T[],
  scope: AdminRegionScope,
): T[] {
  if (isMasterAdmin(scope.role)) return tours
  const regionId = scope.assignedRegionId
  if (!regionId) return tours
  return tours.filter((t) => t.branch_id === regionId)
}

/** Validate admin may assign `guideId` to a tour operating in `tourBranchId`. */
export function validateTourGuideAssignment(params: {
  adminScope: AdminRegionScope
  tourBranchId: string
  guide: GuideAssignmentCandidate | null
}): string | null {
  const { adminScope, tourBranchId, guide } = params
  if (!canAdminAccessRegion(adminScope, tourBranchId)) {
    return '담당 지역 밖의 투어는 생성할 수 없습니다.'
  }
  if (!guide || guide.role !== 'guide' || !guide.is_active) {
    return '유효한 가이드를 선택해주세요.'
  }
  return null
}

/** Guide may work a tour only when assigned on the tour row. */
export function isGuideAssignedToTour(
  tour: Pick<Tour, 'guide_id'>,
  guideUserId: string,
): boolean {
  return tour.guide_id === guideUserId
}

/** Settlement operating region comes from the tour, not the guide's home branch. */
export function resolveSettlementOperatingBranchId(
  tour: Pick<Tour, 'branch_id' | 'guide_id'>,
  guideUserId: string,
): { ok: true; branchId: string } | { ok: false; error: string } {
  if (!isGuideAssignedToTour(tour, guideUserId)) {
    return { ok: false, error: '배정된 투어가 아닙니다.' }
  }
  if (!tour.branch_id) {
    return { ok: false, error: '투어 지역 정보가 없습니다.' }
  }
  return { ok: true, branchId: tour.branch_id }
}
