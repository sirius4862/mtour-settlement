import { describe, expect, it } from 'vitest'
import {
  assertAdminReviewAction,
  assertAdminSaveSettlement,
  canAdminOrMasterAdminEditSettlement,
  canMarkSettlementPaidForRole,
  canMasterAdminEditSettlement,
} from './status-guards'
import {
  ADMIN_SETTLEMENT_REGION_DENIED,
  assertAdminCanAccessSettlementBranch,
} from '@/lib/region/settlement-access'
import type { AdminRegionScope } from '@/lib/region/permissions'

const base = {
  guide_confirmed_at: null as string | null,
  guide_submit_snapshot_id: null as string | null,
}

describe('assertAdminSaveSettlement', () => {
  it('allows admin on submitted and clarification_requested', () => {
    expect(assertAdminSaveSettlement('admin', 'submitted').ok).toBe(true)
    expect(assertAdminSaveSettlement('admin', 'clarification_requested').ok).toBe(true)
  })

  it('allows admin tier pre-confirm edits only; no post-confirm approved edits in v1', () => {
    expect(assertAdminSaveSettlement('admin', 'submitted').ok).toBe(true)
    expect(assertAdminSaveSettlement('master_admin', 'submitted').ok).toBe(true)
    expect(assertAdminSaveSettlement('master_admin', 'clarification_requested').ok).toBe(true)
    expect(assertAdminSaveSettlement('master_admin', 'approved').ok).toBe(false)
    expect(assertAdminSaveSettlement('admin', 'approved').ok).toBe(false)
  })

  it('blocks guide and paid settlements', () => {
    expect(assertAdminSaveSettlement('guide', 'submitted').ok).toBe(false)
    expect(assertAdminSaveSettlement('master_admin', 'paid').ok).toBe(false)
    expect(assertAdminSaveSettlement('admin', 'pending_guide_confirmation').ok).toBe(false)
  })
})

describe('canMasterAdminEditSettlement', () => {
  it('has no post-confirm edit path in v1', () => {
    expect(canMasterAdminEditSettlement('approved')).toBe(false)
    expect(canMasterAdminEditSettlement('paid')).toBe(false)
  })
})

describe('canAdminOrMasterAdminEditSettlement', () => {
  it('allows admin tier only during pre-confirm review (no approved edits in v1)', () => {
    expect(canAdminOrMasterAdminEditSettlement('submitted', 'admin')).toBe(true)
    expect(canAdminOrMasterAdminEditSettlement('submitted', 'master_admin')).toBe(true)
    expect(canAdminOrMasterAdminEditSettlement('approved', 'admin')).toBe(false)
    expect(canAdminOrMasterAdminEditSettlement('approved', 'master_admin')).toBe(false)
  })
})

describe('canMarkSettlementPaidForRole', () => {
  it('allows admin tier on a guide-confirmed payable settlement', () => {
    expect(
      canMarkSettlementPaidForRole('master_admin', {
        ...base,
        status: 'approved',
        guide_confirmed_at: '2026-05-27T00:00:00Z',
        guide_submit_snapshot_id: 'snap-1',
      }),
    ).toBe(true)
    expect(
      canMarkSettlementPaidForRole('admin', {
        ...base,
        status: 'approved',
        guide_confirmed_at: '2026-05-27T00:00:00Z',
      }),
    ).toBe(true)
  })

  it('never allows a guide to pay', () => {
    expect(
      canMarkSettlementPaidForRole('guide', {
        ...base,
        status: 'pending_guide_confirmation',
        guide_confirmed_at: '2026-05-27T00:00:00Z',
      }),
    ).toBe(false)
  })
})

describe('assertAdminReviewAction pay', () => {
  it('allows admin pay when settlement is payable', () => {
    const result = assertAdminReviewAction(
      {
        ...base,
        status: 'approved',
        guide_confirmed_at: '2026-05-27T00:00:00Z',
      },
      'pay',
      'admin',
    )
    expect(result.ok).toBe(true)
  })

  it('allows master_admin pay after guide confirmation', () => {
    const result = assertAdminReviewAction(
      {
        ...base,
        status: 'approved',
        guide_confirmed_at: '2026-05-27T00:00:00Z',
      },
      'pay',
      'master_admin',
    )
    expect(result.ok).toBe(true)
  })

  it('blocks admin pay before guide final confirmation', () => {
    const result = assertAdminReviewAction(
      {
        ...base,
        status: 'pending_guide_confirmation',
        guide_submit_snapshot_id: 'snap-1',
      },
      'pay',
      'admin',
    )
    expect(result.ok).toBe(false)
  })
})

describe('admin pay remains region-scoped', () => {
  const payable = {
    ...base,
    status: 'pending_guide_confirmation' as const,
    guide_confirmed_at: '2026-05-27T00:00:00Z',
  }
  const adminScope: AdminRegionScope = { role: 'admin', assignedRegionId: 'region-A' }

  it('lets an admin pay a payable settlement inside their region', () => {
    expect(assertAdminReviewAction(payable, 'pay', 'admin').ok).toBe(true)
    expect(assertAdminCanAccessSettlementBranch(adminScope, 'region-A').ok).toBe(true)
  })

  it('blocks an admin from paying a settlement outside their region', () => {
    // Role + eligibility guard passes, but the region guard denies the row.
    expect(assertAdminReviewAction(payable, 'pay', 'admin').ok).toBe(true)
    const region = assertAdminCanAccessSettlementBranch(adminScope, 'region-B')
    expect(region.ok).toBe(false)
    expect(region.ok ? null : region.error).toBe(ADMIN_SETTLEMENT_REGION_DENIED)
  })

  it('lets master_admin pay across regions', () => {
    const masterScope: AdminRegionScope = { role: 'master_admin', assignedRegionId: null }
    expect(assertAdminReviewAction(payable, 'pay', 'master_admin').ok).toBe(true)
    expect(assertAdminCanAccessSettlementBranch(masterScope, 'region-B').ok).toBe(true)
  })
})
