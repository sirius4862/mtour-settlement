import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  assertAdminReadOnlyAfterApproval,
  assertRoleCanMarkPaid,
  assertRoleCanSaveAdminSettlement,
  canAccessAdminRoutes,
  canAccessGuideRoutes,
  canAccessVehicleRoutes,
  canAdminReviewActions,
  canAdminReviewEditSettlement,
  canMarkSettlementPaid,
  canMasterApproveFromPending,
  canMasterReopenPaid,
  canOperationalAdminReview,
  canSaveAdminSettlementEdits,
  homePathForRole,
  isAdminTier,
  isPostApprovalReadOnlyForAdmin,
  isVehicleCompany,
  settlementRequiresReconfirmAfterMasterAdminEdit,
} from './permissions'

describe('permissions', () => {
  it('routes guide to /guide only', () => {
    expect(canAccessGuideRoutes('guide')).toBe(true)
    expect(canAccessGuideRoutes('admin')).toBe(false)
    expect(canAccessGuideRoutes('master_admin')).toBe(false)
    expect(canAccessGuideRoutes('vehicle_company')).toBe(false)
    expect(homePathForRole('guide')).toBe('/guide')
  })

  it('routes admin tier to /admin', () => {
    expect(canAccessAdminRoutes('admin')).toBe(true)
    expect(canAccessAdminRoutes('master_admin')).toBe(true)
    expect(canAccessAdminRoutes('guide')).toBe(false)
    expect(canAccessAdminRoutes('vehicle_company')).toBe(false)
    expect(homePathForRole('admin')).toBe('/admin')
    expect(homePathForRole('master_admin')).toBe('/admin')
  })

  it('routes vehicle_company to /vehicle only', () => {
    expect(isVehicleCompany('vehicle_company')).toBe(true)
    expect(isVehicleCompany('guide')).toBe(false)
    expect(isVehicleCompany('admin')).toBe(false)
    expect(isVehicleCompany('master_admin')).toBe(false)

    expect(canAccessVehicleRoutes('vehicle_company')).toBe(true)
    expect(canAccessVehicleRoutes('guide')).toBe(false)
    expect(canAccessVehicleRoutes('admin')).toBe(false)
    expect(canAccessVehicleRoutes('master_admin')).toBe(false)

    expect(homePathForRole('vehicle_company')).toBe('/vehicle')
  })

  it('keeps vehicle_company out of the admin tier and guide/admin routes', () => {
    expect(isAdminTier('vehicle_company')).toBe(false)
    expect(canAccessGuideRoutes('vehicle_company')).toBe(false)
    expect(canAccessAdminRoutes('vehicle_company')).toBe(false)
    expect(canMarkSettlementPaid('vehicle_company')).toBe(false)
    expect(canOperationalAdminReview('vehicle_company')).toBe(false)
  })

  it('protects the /vehicle route group with requireVehicleCompany', () => {
    const layout = readFileSync('src/app/vehicle/layout.tsx', 'utf8')
    expect(layout).toContain('requireVehicleCompany')
    expect(layout).toMatch(/await requireVehicleCompany\(\)/)
  })

  it('allows admin and master_admin to mark paid, never guide', () => {
    expect(canMarkSettlementPaid('master_admin')).toBe(true)
    expect(canMarkSettlementPaid('admin')).toBe(true)
    expect(canMarkSettlementPaid('guide')).toBe(false)
    expect(assertRoleCanMarkPaid('admin').ok).toBe(true)
    expect(assertRoleCanMarkPaid('master_admin').ok).toBe(true)
    expect(assertRoleCanMarkPaid('guide').ok).toBe(false)
  })

  it('allows admin tier edits only during submitted review', () => {
    expect(canSaveAdminSettlementEdits('submitted', 'admin')).toBe(true)
    expect(canSaveAdminSettlementEdits('approved', 'master_admin')).toBe(false)
    expect(canSaveAdminSettlementEdits('paid', 'master_admin')).toBe(false)
    expect(assertRoleCanSaveAdminSettlement('master_admin', 'paid').ok).toBe(false)
  })

  it('does not require re-confirm after master edits in v1', () => {
    expect(settlementRequiresReconfirmAfterMasterAdminEdit('pending_guide_confirmation', 'master_admin')).toBe(false)
  })

  it('locks plain admin only after paid', () => {
    expect(isPostApprovalReadOnlyForAdmin('paid')).toBe(true)
    expect(isPostApprovalReadOnlyForAdmin('pending_guide_confirmation')).toBe(false)
    expect(assertAdminReadOnlyAfterApproval('admin', 'paid').ok).toBe(false)
    expect(assertAdminReadOnlyAfterApproval('admin', 'pending_guide_confirmation').ok).toBe(true)
    expect(assertRoleCanSaveAdminSettlement('admin', 'pending_guide_confirmation').ok).toBe(false)
  })

  it('master_admin inherits admin operational permissions', () => {
    expect(canOperationalAdminReview('master_admin')).toBe(true)
    expect(canAdminReviewActions('master_admin')).toBe(true)
    expect(canAdminReviewEditSettlement('submitted', 'master_admin')).toBe(true)
    expect(canAdminReviewEditSettlement('clarification_requested', 'master_admin')).toBe(true)
    expect(canMasterReopenPaid('paid', 'master_admin')).toBe(true)
  })

  it('disables deprecated master approve path', () => {
    expect(canMasterApproveFromPending('pending_guide_confirmation', 'master_admin')).toBe(false)
    expect(canMasterApproveFromPending('pending_guide_confirmation', 'admin')).toBe(false)
    expect(canMasterReopenPaid('paid', 'admin')).toBe(false)
  })
})
