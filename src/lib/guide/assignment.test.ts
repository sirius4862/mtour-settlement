import { describe, expect, it } from 'vitest'
import { MTOUR_REGION_CODES, type MtourRegionCode } from '@/lib/region/regions'
import {
  filterAdminToursByRegionScope,
  filterGuidesForTourAssignment,
  isGuideAssignedToTour,
  resolveSettlementOperatingBranchId,
  validateTourGuideAssignment,
} from './assignment'

const DANANG = 'region-danang'
const NHATRANG = 'region-nhatrang'

const danangAdmin = { role: 'admin' as const, assignedRegionId: DANANG }
const nhatrangGuide = {
  id: 'guide-nhatrang',
  role: 'guide',
  is_active: true,
  branch_id: NHATRANG,
}
const danangGuide = {
  id: 'guide-danang',
  role: 'guide',
  is_active: true,
  branch_id: DANANG,
}

describe('guide assignment across regions', () => {
  it('DANANG admin sees NHA TRANG guide in assignment list', () => {
    const guides = filterGuidesForTourAssignment([danangGuide, nhatrangGuide])
    expect(guides.map((g) => g.id)).toContain(nhatrangGuide.id)
    expect(guides).toHaveLength(2)
  })

  it('DANANG admin can assign NHA TRANG guide to DANANG tour', () => {
    expect(
      validateTourGuideAssignment({
        adminScope: danangAdmin,
        tourBranchId: DANANG,
        guide: nhatrangGuide,
      }),
    ).toBeNull()
  })

  it('DANANG admin cannot create tour in NHA TRANG', () => {
    expect(
      validateTourGuideAssignment({
        adminScope: danangAdmin,
        tourBranchId: NHATRANG,
        guide: nhatrangGuide,
      }),
    ).toBe('담당 지역 밖의 투어는 생성할 수 없습니다.')
  })

  it('master_admin can assign any guide to any region tour', () => {
    expect(
      validateTourGuideAssignment({
        adminScope: { role: 'master_admin', assignedRegionId: DANANG },
        tourBranchId: NHATRANG,
        guide: danangGuide,
      }),
    ).toBeNull()
  })

  it('NHA TRANG guide assigned to DANANG tour uses tour operating branch on settlement', () => {
    const tour = { guide_id: nhatrangGuide.id, branch_id: DANANG }
    expect(isGuideAssignedToTour(tour, nhatrangGuide.id)).toBe(true)
    expect(resolveSettlementOperatingBranchId(tour, nhatrangGuide.id)).toEqual({
      ok: true,
      branchId: DANANG,
    })
  })

  it('NHA TRANG guide cannot open settlement for unassigned DANANG tour', () => {
    const tour = { guide_id: danangGuide.id, branch_id: DANANG }
    expect(isGuideAssignedToTour(tour, nhatrangGuide.id)).toBe(false)
    expect(resolveSettlementOperatingBranchId(tour, nhatrangGuide.id)).toEqual({
      ok: false,
      error: '배정된 투어가 아닙니다.',
    })
  })

  it('DANANG admin tour list excludes NHA TRANG operating tours', () => {
    const tours = filterAdminToursByRegionScope(
      [
        { branch_id: DANANG, id: 't1' } as { branch_id: string; id: string },
        { branch_id: NHATRANG, id: 't2' } as { branch_id: string; id: string },
      ],
      danangAdmin,
    )
    expect(tours.map((t) => t.id)).toEqual(['t1'])
  })

  it('master_admin tour list includes all regions', () => {
    const tours = filterAdminToursByRegionScope(
      [
        { branch_id: DANANG, id: 't1' } as { branch_id: string; id: string },
        { branch_id: NHATRANG, id: 't2' } as { branch_id: string; id: string },
      ],
      { role: 'master_admin', assignedRegionId: DANANG },
    )
    expect(tours).toHaveLength(2)
  })
})

// All-region conversion: the same assignment rules must hold for every
// registered MTour region code (including GRAND_ACE), not Da Nang / Nha Trang only.
function otherRegion(region: MtourRegionCode): MtourRegionCode {
  const other = MTOUR_REGION_CODES.find((c) => c !== region)
  if (!other) throw new Error('Region list must contain more than one region')
  return other
}

describe.each(MTOUR_REGION_CODES)('guide assignment for region %s', (region) => {
  const other = otherRegion(region)
  const adminHere = { role: 'admin' as const, assignedRegionId: region }
  const guide = { id: 'g1', role: 'guide', is_active: true, branch_id: other }

  it(`admin can create a tour in ${region} with a guide whose home is ${other}`, () => {
    expect(
      validateTourGuideAssignment({ adminScope: adminHere, tourBranchId: region, guide }),
    ).toBeNull()
  })

  it(`admin scoped to ${region} cannot create a tour in ${other}`, () => {
    expect(
      validateTourGuideAssignment({ adminScope: adminHere, tourBranchId: other, guide }),
    ).toBe('담당 지역 밖의 투어는 생성할 수 없습니다.')
  })

  it(`tour list for the ${region} admin keeps ${region} and drops ${other}`, () => {
    const tours = filterAdminToursByRegionScope(
      [
        { branch_id: region, id: 'here' },
        { branch_id: other, id: 'there' },
      ],
      adminHere,
    )
    expect(tours.map((t) => t.id)).toEqual(['here'])
  })

  it(`settlement for a ${region} tour inherits ${region} as operating branch`, () => {
    const tour = { guide_id: guide.id, branch_id: region }
    expect(isGuideAssignedToTour(tour, guide.id)).toBe(true)
    expect(resolveSettlementOperatingBranchId(tour, guide.id)).toEqual({
      ok: true,
      branchId: region,
    })
  })

  it(`master_admin can assign any guide to a ${region} tour`, () => {
    expect(
      validateTourGuideAssignment({
        adminScope: { role: 'master_admin', assignedRegionId: null },
        tourBranchId: region,
        guide,
      }),
    ).toBeNull()
  })
})
