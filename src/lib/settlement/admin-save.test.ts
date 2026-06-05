import { describe, expect, it } from 'vitest'
import {
  assertAdminReviewAction,
  assertAdminSaveSettlement,
  canAdminOrMasterAdminEditSettlement,
  canMarkSettlementPaidForRole,
  canMasterAdminEditSettlement,
} from './status-guards'

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
  it('requires master_admin and approved guide-confirmed settlement', () => {
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
    ).toBe(false)
  })
})

describe('assertAdminReviewAction pay', () => {
  it('blocks admin pay even when settlement is payable', () => {
    const result = assertAdminReviewAction(
      {
        ...base,
        status: 'approved',
        guide_confirmed_at: '2026-05-27T00:00:00Z',
      },
      'pay',
      'admin',
    )
    expect(result.ok).toBe(false)
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
})
