import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  MTOUR_REGION_CODES,
  MTOUR_REGION_LABELS,
  filterMtourRegionBranches,
  formatRegionLabel,
  isMtourRegionCode,
  type MtourRegionCode,
} from './regions'
import { canAdminAccessRegion, resolveAdminRegionFilter } from './permissions'
import {
  ADMIN_SETTLEMENT_REGION_DENIED,
  assertAdminCanAccessSettlementBranch,
  evaluateAdminSettlementReadAccess,
} from './settlement-access'
import {
  filterAdminToursByRegionScope,
  isGuideAssignedToTour,
  resolveSettlementOperatingBranchId,
  validateTourGuideAssignment,
} from '@/lib/guide/assignment'
import {
  countDashboardFilteredRows,
  resolveDashboardRegionFilter,
} from '@/lib/admin/dashboard-filter'
import { assertAdminReviewAction } from '@/lib/settlement/status-guards'
import {
  resolveNewSettlementBinding,
  resolveRequestedTourId,
} from '@/lib/settlement/new-settlement-binding'
import type { SettlementPayGuardInput } from '@/lib/auth/permissions'

/**
 * Canonical region coverage.
 *
 * Every region-aware feature is exercised across ALL registered MTour region
 * codes (the canonical source: MTOUR_REGION_CODES), not Da Nang only. Grand Ace
 * is included automatically because it is a normal registered region code — no
 * special-casing here. Using each region code directly as the branch_id keeps
 * the suite honest: a Da Nang-defaulting regression would fail for every other
 * region, including GRAND_ACE.
 */

const DANANG = 'DANANG'
const GUIDE_A = 'guide-A'
const GUIDE_B = 'guide-B'

/** A different registered region than `region`, used for cross-region negatives. */
function otherRegionThan(region: MtourRegionCode): MtourRegionCode {
  const other = MTOUR_REGION_CODES.find((c) => c !== region)
  if (!other) throw new Error('Region list must contain more than one region')
  return other
}

const validGuide = { id: GUIDE_A, role: 'guide', is_active: true, branch_id: null }

const payableConfirmed: SettlementPayGuardInput = {
  status: 'pending_guide_confirmation',
  guide_confirmed_at: '2026-05-27T00:00:00Z',
  guide_submit_snapshot_id: null,
}

describe('region registry is the canonical source (Grand Ace is a normal region)', () => {
  it('registers Grand Ace alongside the other MTour regions', () => {
    expect(MTOUR_REGION_CODES).toContain('GRAND_ACE')
    expect(MTOUR_REGION_CODES).toContain('DANANG')
    expect(isMtourRegionCode('GRAND_ACE')).toBe(true)
    expect(MTOUR_REGION_LABELS.GRAND_ACE).toBe('Grand Ace')
  })

  it('keeps Da Nang unchanged', () => {
    expect(isMtourRegionCode('DANANG')).toBe(true)
    expect(MTOUR_REGION_LABELS.DANANG).toBe('Da Nang')
  })

  it('has no duplicate region codes', () => {
    expect(new Set(MTOUR_REGION_CODES).size).toBe(MTOUR_REGION_CODES.length)
  })
})

describe('admin region/branch selector shows every registered region', () => {
  // One branches row per registered region + a legacy non-region row.
  const branchRows = [
    ...MTOUR_REGION_CODES.map((code) => ({
      id: `branch-${code}`,
      code,
      name: MTOUR_REGION_LABELS[code],
    })),
    { id: 'branch-legacy', code: 'LEGACY', name: 'Legacy Branch' },
  ]

  it('keeps all registered region branches and drops unregistered ones', () => {
    const visible = filterMtourRegionBranches(branchRows)
    const visibleCodes = visible.map((b) => b.code)
    for (const code of MTOUR_REGION_CODES) {
      expect(visibleCodes).toContain(code)
    }
    expect(visibleCodes).toContain('GRAND_ACE')
    expect(visibleCodes).not.toContain('LEGACY')
    expect(visible).toHaveLength(MTOUR_REGION_CODES.length)
  })

  it('does not silently filter out any registered region', () => {
    const visibleCodes = filterMtourRegionBranches(branchRows).map((b) => b.code)
    const missing = MTOUR_REGION_CODES.filter((c) => !visibleCodes.includes(c))
    expect(missing).toEqual([])
  })

  it('getBranches filters by MTour codes and scopes by assigned region (no hard-coded Da Nang)', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/lib/actions/tourActions.ts'),
      'utf8',
    )
    expect(source).toContain('filterMtourRegionBranches')
    expect(source).toContain('scope.assignedRegionId')
    expect(source).not.toMatch(/['"]DANANG['"]/)
  })
})

describe.each(MTOUR_REGION_CODES)('region %s behaves like every other region', (region) => {
  const other = otherRegionThan(region)
  const adminHere = { role: 'admin' as const, assignedRegionId: region }
  const adminElsewhere = { role: 'admin' as const, assignedRegionId: other }
  const master = { role: 'master_admin' as const, assignedRegionId: null }

  // 1. Selector label
  it(`[${region}] renders its own display label`, () => {
    expect(formatRegionLabel(region)).toBe(MTOUR_REGION_LABELS[region])
    expect(formatRegionLabel(region)).not.toBe('—')
  })

  // 2. Tour creation/edit by region
  it(`[${region}] admin assigned here can create a tour in this region`, () => {
    expect(
      validateTourGuideAssignment({
        adminScope: adminHere,
        tourBranchId: region,
        guide: validGuide,
      }),
    ).toBeNull()
  })

  it(`[${region}] admin assigned elsewhere cannot create a tour in this region`, () => {
    expect(
      validateTourGuideAssignment({
        adminScope: adminElsewhere,
        tourBranchId: region,
        guide: validGuide,
      }),
    ).toBe('담당 지역 밖의 투어는 생성할 수 없습니다.')
  })

  it(`[${region}] admin tour list keeps this region and excludes the other region`, () => {
    const tours = filterAdminToursByRegionScope(
      [
        { id: `tour-${region}`, branch_id: region },
        { id: `tour-${other}`, branch_id: other },
      ],
      adminHere,
    )
    expect(tours.map((t) => t.id)).toEqual([`tour-${region}`])
  })

  // 3. Settlement inheritance by region (operating branch comes from the tour)
  it(`[${region}] settlement inherits the tour's region, never defaulting to Da Nang`, () => {
    const tour = { guide_id: GUIDE_A, branch_id: region }
    const resolved = resolveSettlementOperatingBranchId(tour, GUIDE_A)
    expect(resolved).toEqual({ ok: true, branchId: region })
    if (region !== DANANG) {
      expect(resolved.ok && resolved.branchId).not.toBe(DANANG)
    }
  })

  it(`[${region}] settlement lists filter to this region only (no Da Nang default)`, () => {
    // Includes an explicit Da Nang row so a region filter that "defaults" to
    // Da Nang would over-count. `other` may itself be Da Nang for some regions,
    // so expected counts are derived from the data rather than hard-coded.
    const rows = [
      { status: 'submitted', branch_id: region },
      { status: 'submitted', branch_id: region },
      { status: 'paid', branch_id: region },
      { status: 'submitted', branch_id: DANANG },
      { status: 'submitted', branch_id: other },
    ]
    const regionRows = rows.filter((r) => r.branch_id === region)
    const regionSubmitted = regionRows.filter((r) => r.status === 'submitted')
    expect(countDashboardFilteredRows(rows, { regionId: region })).toBe(regionRows.length)
    expect(countDashboardFilteredRows(rows, { regionId: region, status: 'submitted' })).toBe(
      regionSubmitted.length,
    )
  })

  // 4. Guide assignment visibility by region (assignment-based, not home region)
  it(`[${region}] assigned guide sees the tour; unassigned guide does not`, () => {
    const tour = { guide_id: GUIDE_A, branch_id: region }
    expect(isGuideAssignedToTour(tour, GUIDE_A)).toBe(true)
    expect(isGuideAssignedToTour(tour, GUIDE_B)).toBe(false)
    expect(resolveSettlementOperatingBranchId(tour, GUIDE_B)).toEqual({
      ok: false,
      error: '배정된 투어가 아닙니다.',
    })
  })

  // 5. Admin region filtering / permissions by region
  it(`[${region}] admin here can access this region but not the other region`, () => {
    expect(canAdminAccessRegion(adminHere, region)).toBe(true)
    expect(canAdminAccessRegion(adminHere, other)).toBe(false)
    expect(resolveAdminRegionFilter(adminHere)).toBe(region)
    // Forcing a different requested region cannot escape the assigned scope.
    expect(resolveAdminRegionFilter(adminHere, other)).toBe(region)
  })

  it(`[${region}] master_admin can access this region and all others`, () => {
    expect(canAdminAccessRegion(master, region)).toBe(true)
    expect(canAdminAccessRegion(master, other)).toBe(true)
    expect(resolveAdminRegionFilter(master, region)).toBe(region)
  })

  it(`[${region}] admin settlement read/mutate gate respects this region`, () => {
    expect(
      evaluateAdminSettlementReadAccess({
        scope: adminHere,
        settlementBranchId: region,
        callerRole: 'admin',
      }),
    ).toBe('allow')
    expect(
      evaluateAdminSettlementReadAccess({
        scope: adminHere,
        settlementBranchId: other,
        callerRole: 'admin',
      }),
    ).toBe('deny')
    expect(assertAdminCanAccessSettlementBranch(adminHere, region)).toEqual({ ok: true })
    expect(assertAdminCanAccessSettlementBranch(adminHere, other)).toEqual({
      ok: false,
      error: ADMIN_SETTLEMENT_REGION_DENIED,
    })
  })

  it(`[${region}] dashboard region filter never defaults to Da Nang`, () => {
    expect(
      resolveDashboardRegionFilter({
        role: 'admin',
        assignedRegionId: region,
        requestedRegionId: other,
      }),
    ).toBe(region)
  })

  // 6. Payment permission by region
  it(`[${region}] admin can pay an eligible guide-confirmed settlement within this region`, () => {
    expect(assertAdminReviewAction(payableConfirmed, 'pay', 'admin').ok).toBe(true)
    expect(assertAdminCanAccessSettlementBranch(adminHere, region).ok).toBe(true)
  })

  it(`[${region}] admin cannot pay a settlement in this region from another region`, () => {
    // Pay role/eligibility guard passes, but the region gate denies the row.
    expect(assertAdminReviewAction(payableConfirmed, 'pay', 'admin').ok).toBe(true)
    expect(assertAdminCanAccessSettlementBranch(adminElsewhere, region).ok).toBe(false)
  })

  it(`[${region}] master_admin can pay across regions; guide can never pay`, () => {
    expect(assertAdminReviewAction(payableConfirmed, 'pay', 'master_admin').ok).toBe(true)
    expect(assertAdminCanAccessSettlementBranch(master, region).ok).toBe(true)
    expect(assertAdminReviewAction(payableConfirmed, 'pay', 'guide').ok).toBe(false)
  })

  it(`[${region}] paid settlement stays locked from re-pay`, () => {
    const paid: SettlementPayGuardInput = {
      status: 'paid',
      guide_confirmed_at: '2026-05-27T00:00:00Z',
      guide_submit_snapshot_id: null,
    }
    expect(assertAdminReviewAction(paid, 'pay', 'admin').ok).toBe(false)
    expect(assertAdminReviewAction(paid, 'pay', 'master_admin').ok).toBe(false)
  })

  // 7. New settlement creation/binding by region
  it(`[${region}] new-settlement form binds this region's tour, never a Da Nang fallback`, () => {
    const tourHere = `tour-${region}`
    const tourOther = `tour-${other}`
    // A stale settlement from another region is persisted; selecting this
    // region's assigned tour must rebind cleanly with no inherited id/tour.
    const decision = resolveNewSettlementBinding(
      { settlementId: `settlement-${other}`, tourId: tourOther, guideName: GUIDE_A },
      tourHere,
      GUIDE_A,
    )
    expect(decision.reset).toBe(true)
    expect(decision.bindTourId).toBe(tourHere)
    expect(decision.bindTourId).not.toBe(tourOther)
  })

  it(`[${region}] only this region's assigned tour id is accepted (no out-of-scope fallback)`, () => {
    const tourHere = `tour-${region}`
    const tourOther = `tour-${other}`
    const guideTours = [{ id: tourHere }]
    expect(resolveRequestedTourId(guideTours, tourHere)).toBe(tourHere)
    // An out-of-scope tour id resolves to null — never silently swapped.
    expect(resolveRequestedTourId(guideTours, tourOther)).toBeNull()
  })
})

describe('cross-region: master_admin sees every region, admin is scoped', () => {
  const allRegionTours = MTOUR_REGION_CODES.map((code) => ({
    id: `tour-${code}`,
    branch_id: code as string,
  }))

  it('master_admin tour list includes every registered region', () => {
    const tours = filterAdminToursByRegionScope(allRegionTours, {
      role: 'master_admin',
      assignedRegionId: null,
    })
    expect(tours.map((t) => t.branch_id).sort()).toEqual(
      [...MTOUR_REGION_CODES].sort(),
    )
  })

  it('each region-scoped admin sees exactly one region (and Grand Ace works the same)', () => {
    for (const code of MTOUR_REGION_CODES) {
      const tours = filterAdminToursByRegionScope(allRegionTours, {
        role: 'admin',
        assignedRegionId: code,
      })
      expect(tours.map((t) => t.branch_id)).toEqual([code])
    }
  })
})
