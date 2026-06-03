import { describe, expect, it } from 'vitest'
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
