import { describe, expect, it } from 'vitest'
import { MTOUR_REGION_CODES, type MtourRegionCode } from './regions'
import {
  ADMIN_SETTLEMENT_REGION_DENIED,
  assertAdminCanAccessSettlementBranch,
  evaluateAdminSettlementReadAccess,
} from './settlement-access'

const DANANG = 'region-danang'
const NHATRANG = 'region-nhatrang'

const danangAdminScope = { role: 'admin' as const, assignedRegionId: DANANG }
const masterScope = { role: 'master_admin' as const, assignedRegionId: DANANG }

describe('admin settlement region gate (settlements.branch_id)', () => {
  it('DANANG admin cannot access NHATRANG settlement (read gate)', () => {
    expect(
      evaluateAdminSettlementReadAccess({
        scope: danangAdminScope,
        settlementBranchId: NHATRANG,
        callerRole: 'admin',
      }),
    ).toBe('deny')
  })

  it('DANANG admin cannot save/mutate NHATRANG settlement (assert)', () => {
    expect(assertAdminCanAccessSettlementBranch(danangAdminScope, NHATRANG)).toEqual({
      ok: false,
      error: ADMIN_SETTLEMENT_REGION_DENIED,
    })
  })

  it('master_admin can access NHATRANG settlement', () => {
    expect(
      evaluateAdminSettlementReadAccess({
        scope: masterScope,
        settlementBranchId: NHATRANG,
        callerRole: 'master_admin',
      }),
    ).toBe('allow')
    expect(assertAdminCanAccessSettlementBranch(masterScope, NHATRANG)).toEqual({ ok: true })
  })

  it('same-region DANANG admin can read and mutate DANANG settlement', () => {
    expect(
      evaluateAdminSettlementReadAccess({
        scope: danangAdminScope,
        settlementBranchId: DANANG,
        callerRole: 'admin',
      }),
    ).toBe('allow')
    expect(assertAdminCanAccessSettlementBranch(danangAdminScope, DANANG)).toEqual({ ok: true })
  })

  it('guide audience bypasses admin region gate (access still via guide_id elsewhere)', () => {
    expect(
      evaluateAdminSettlementReadAccess({
        scope: danangAdminScope,
        settlementBranchId: NHATRANG,
        callerRole: 'admin',
        audience: 'guide',
      }),
    ).toBe('allow')
  })

  it('does not use guide profile branch — only settlement branch_id', () => {
    const guideHomeDanang = DANANG
    const operatingNhatrang = NHATRANG
    expect(guideHomeDanang).not.toBe(operatingNhatrang)
    expect(assertAdminCanAccessSettlementBranch(danangAdminScope, operatingNhatrang).ok).toBe(
      false,
    )
  })
})

// All-region conversion: the settlement region gate must enforce the same rule
// for every registered MTour region (including GRAND_ACE), not Da Nang only.
function otherRegion(region: MtourRegionCode): MtourRegionCode {
  const other = MTOUR_REGION_CODES.find((c) => c !== region)
  if (!other) throw new Error('Region list must contain more than one region')
  return other
}

describe.each(MTOUR_REGION_CODES)('admin settlement region gate for %s', (region) => {
  const other = otherRegion(region)
  const adminHere = { role: 'admin' as const, assignedRegionId: region }
  const master = { role: 'master_admin' as const, assignedRegionId: null }

  it(`${region} admin can read/mutate a ${region} settlement`, () => {
    expect(
      evaluateAdminSettlementReadAccess({
        scope: adminHere,
        settlementBranchId: region,
        callerRole: 'admin',
      }),
    ).toBe('allow')
    expect(assertAdminCanAccessSettlementBranch(adminHere, region)).toEqual({ ok: true })
  })

  it(`${region} admin cannot read/mutate a ${other} settlement`, () => {
    expect(
      evaluateAdminSettlementReadAccess({
        scope: adminHere,
        settlementBranchId: other,
        callerRole: 'admin',
      }),
    ).toBe('deny')
    expect(assertAdminCanAccessSettlementBranch(adminHere, other)).toEqual({
      ok: false,
      error: ADMIN_SETTLEMENT_REGION_DENIED,
    })
  })

  it(`master_admin can access a ${region} settlement`, () => {
    expect(
      evaluateAdminSettlementReadAccess({
        scope: master,
        settlementBranchId: region,
        callerRole: 'master_admin',
      }),
    ).toBe('allow')
    expect(assertAdminCanAccessSettlementBranch(master, region)).toEqual({ ok: true })
  })
})
