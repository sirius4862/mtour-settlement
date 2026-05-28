import { describe, expect, it } from 'vitest'
import {
  assertAdminReviewAction,
  canAdminDirectApprove,
  canAdminEditSettlement,
  canAdminPaySettlement,
  canGuideConfirm,
  canGuideEdit,
  GUIDE_EDITABLE,
} from './status-guards'
import type { SettlementStatus } from '@/types'

const base = {
  guide_id: 'guide-1',
  guide_confirmed_at: null as string | null,
  guide_submit_snapshot_id: null as string | null,
}

describe('canGuideEdit', () => {
  it('allows draft, rejected, edit_requested for owner', () => {
    for (const status of GUIDE_EDITABLE) {
      expect(canGuideEdit({ status, guide_id: 'guide-1' }, 'guide-1')).toBe(true)
    }
  })

  it('denies submitted and confirmation statuses', () => {
    for (const status of [
      'submitted',
      'pending_guide_confirmation',
      'clarification_requested',
      'approved',
      'paid',
    ] as SettlementStatus[]) {
      expect(canGuideEdit({ status, guide_id: 'guide-1' }, 'guide-1')).toBe(false)
    }
  })
})

describe('canGuideConfirm', () => {
  it('allows only pending_guide_confirmation for owner', () => {
    expect(
      canGuideConfirm({ status: 'pending_guide_confirmation', guide_id: 'guide-1' }, 'guide-1'),
    ).toBe(true)
    expect(canGuideConfirm({ status: 'submitted', guide_id: 'guide-1' }, 'guide-1')).toBe(false)
  })
})

describe('canAdminEditSettlement', () => {
  it('allows submitted and clarification_requested', () => {
    expect(canAdminEditSettlement('submitted')).toBe(true)
    expect(canAdminEditSettlement('clarification_requested')).toBe(true)
    expect(canAdminEditSettlement('pending_guide_confirmation')).toBe(false)
  })
})

describe('canAdminDirectApprove', () => {
  it('is always false in the new workflow', () => {
    expect(canAdminDirectApprove('submitted')).toBe(false)
    expect(canAdminDirectApprove('approved')).toBe(false)
  })
})

describe('canAdminPaySettlement', () => {
  it('allows legacy approved without snapshot', () => {
    expect(canAdminPaySettlement({ ...base, status: 'approved' })).toBe(true)
  })

  it('blocks approved when snapshot exists but guide has not confirmed', () => {
    expect(
      canAdminPaySettlement({
        ...base,
        status: 'approved',
        guide_submit_snapshot_id: 'snap-1',
        guide_confirmed_at: null,
      }),
    ).toBe(false)
  })

  it('allows approved after guide confirmation', () => {
    expect(
      canAdminPaySettlement({
        ...base,
        status: 'approved',
        guide_submit_snapshot_id: 'snap-1',
        guide_confirmed_at: '2026-05-27T00:00:00Z',
      }),
    ).toBe(true)
  })
})

describe('assertAdminReviewAction', () => {
  it('blocks admin approve from submitted', () => {
    const result = assertAdminReviewAction({ ...base, status: 'submitted' }, 'approve')
    expect(result.ok).toBe(false)
  })

  it('allows reject from submitted', () => {
    expect(assertAdminReviewAction({ ...base, status: 'submitted' }, 'reject').ok).toBe(true)
  })

  it('blocks pay before guide confirmation when snapshot exists', () => {
    const result = assertAdminReviewAction(
      {
        ...base,
        status: 'approved',
        guide_submit_snapshot_id: 'snap-1',
      },
      'pay',
    )
    expect(result.ok).toBe(false)
  })
})
