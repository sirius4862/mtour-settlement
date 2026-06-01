import { describe, expect, it } from 'vitest'
import {
  assertAdminReadOnlyAfterApproval,
  assertRoleCanMarkPaid,
  assertRoleCanSaveAdminSettlement,
  canAccessAdminRoutes,
  canAccessGuideRoutes,
  canMarkSettlementPaid,
  canMasterApproveFromPending,
  canMasterReopenPaid,
  canOperationalAdminReview,
  canSaveAdminSettlementEdits,
  homePathForRole,
  isPostApprovalReadOnlyForAdmin,
  settlementRequiresReconfirmAfterMasterAdminEdit,
} from './permissions'

describe('permissions', () => {
  it('routes guide to /guide only', () => {
    expect(canAccessGuideRoutes('guide')).toBe(true)
    expect(canAccessGuideRoutes('admin')).toBe(false)
    expect(canAccessGuideRoutes('master_admin')).toBe(false)
    expect(homePathForRole('guide')).toBe('/guide')
  })

  it('routes admin tier to /admin', () => {
    expect(canAccessAdminRoutes('admin')).toBe(true)
    expect(canAccessAdminRoutes('master_admin')).toBe(true)
    expect(canAccessAdminRoutes('guide')).toBe(false)
    expect(homePathForRole('admin')).toBe('/admin')
    expect(homePathForRole('master_admin')).toBe('/admin')
  })

  it('restricts payment to master_admin', () => {
    expect(canMarkSettlementPaid('master_admin')).toBe(true)
    expect(canMarkSettlementPaid('admin')).toBe(false)
    expect(assertRoleCanMarkPaid('admin').ok).toBe(false)
    expect(assertRoleCanMarkPaid('master_admin').ok).toBe(true)
  })

  it('allows admin pre-confirm edits and master_admin approved edits only', () => {
    expect(canSaveAdminSettlementEdits('submitted', 'admin')).toBe(true)
    expect(canSaveAdminSettlementEdits('approved', 'admin')).toBe(false)
    expect(canSaveAdminSettlementEdits('approved', 'master_admin')).toBe(true)
    expect(canSaveAdminSettlementEdits('paid', 'master_admin')).toBe(false)
    expect(assertRoleCanSaveAdminSettlement('master_admin', 'paid').ok).toBe(false)
  })

  it('requires re-confirm when master_admin edits approved settlement', () => {
    expect(settlementRequiresReconfirmAfterMasterAdminEdit('approved', 'master_admin')).toBe(true)
    expect(settlementRequiresReconfirmAfterMasterAdminEdit('submitted', 'master_admin')).toBe(false)
    expect(settlementRequiresReconfirmAfterMasterAdminEdit('approved', 'admin')).toBe(false)
  })

  it('locks admin after approved or paid', () => {
    expect(isPostApprovalReadOnlyForAdmin('approved')).toBe(true)
    expect(isPostApprovalReadOnlyForAdmin('paid')).toBe(true)
    expect(isPostApprovalReadOnlyForAdmin('submitted')).toBe(false)
    expect(assertAdminReadOnlyAfterApproval('admin', 'approved').ok).toBe(false)
    expect(assertAdminReadOnlyAfterApproval('admin', 'paid').ok).toBe(false)
    expect(assertAdminReadOnlyAfterApproval('master_admin', 'approved').ok).toBe(true)
    expect(assertRoleCanSaveAdminSettlement('admin', 'approved').ok).toBe(false)
  })

  it('restricts operational review to admin role only', () => {
    expect(canOperationalAdminReview('admin')).toBe(true)
    expect(canOperationalAdminReview('master_admin')).toBe(false)
    expect(canMasterApproveFromPending('pending_guide_confirmation', 'master_admin')).toBe(true)
    expect(canMasterApproveFromPending('pending_guide_confirmation', 'admin')).toBe(false)
    expect(canMasterReopenPaid('paid', 'master_admin')).toBe(true)
    expect(canMasterReopenPaid('approved', 'master_admin')).toBe(false)
  })
})
