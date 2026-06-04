import { describe, expect, it } from 'vitest'
import {
  assertAdminReviewAction,
  assertAdminSendForConfirmation,
  assertGuideConfirmAction,
  canAdminDirectApprove,
  canAdminEditSettlement,
  canAdminPaySettlement,
  canAdminReject,
  canAdminSendForConfirmation,
  canGuideConfirm,
  canGuideEdit,
  canGuideRequestClarification,
  GUIDE_EDITABLE,
  isStuckGuideConfirmation,
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
  it('allows only pending_guide_confirmation for owner before guide confirms', () => {
    expect(
      canGuideConfirm(
        { status: 'pending_guide_confirmation', guide_id: 'guide-1', guide_confirmed_at: null },
        'guide-1',
      ),
    ).toBe(true)
    expect(canGuideConfirm({ status: 'submitted', guide_id: 'guide-1', guide_confirmed_at: null }, 'guide-1')).toBe(false)
  })

  it('denies after guide_confirmed_at is set', () => {
    expect(
      canGuideConfirm(
        {
          status: 'pending_guide_confirmation',
          guide_id: 'guide-1',
          guide_confirmed_at: '2026-05-27T00:00:00Z',
        },
        'guide-1',
      ),
    ).toBe(false)
  })
})

describe('isStuckGuideConfirmation', () => {
  const pending = {
    status: 'pending_guide_confirmation' as SettlementStatus,
    guide_confirmed_at: null as string | null,
    active_confirmation_id: 'conf-1' as string | null,
  }

  it('is false for a healthy pending packet (guide can confirm normally)', () => {
    expect(isStuckGuideConfirmation(pending, 'pending')).toBe(false)
  })

  it('detects 260426-style desync: confirmed packet but guide_confirmed_at is null', () => {
    expect(isStuckGuideConfirmation(pending, 'confirmed')).toBe(true)
  })

  it('detects missing active confirmation packet', () => {
    expect(
      isStuckGuideConfirmation({ ...pending, active_confirmation_id: null }, null),
    ).toBe(true)
  })

  it('is false once the guide has already confirmed (awaiting payment)', () => {
    expect(
      isStuckGuideConfirmation(
        { ...pending, guide_confirmed_at: '2026-06-02T08:14:10Z' },
        'confirmed',
      ),
    ).toBe(false)
  })

  it('is false for statuses other than pending_guide_confirmation', () => {
    expect(
      isStuckGuideConfirmation({ ...pending, status: 'submitted' }, 'confirmed'),
    ).toBe(false)
    expect(isStuckGuideConfirmation({ ...pending, status: 'paid' }, null)).toBe(false)
  })
})

describe('canAdminEditSettlement', () => {
  it('allows submitted and legacy clarification_requested', () => {
    expect(canAdminEditSettlement('submitted')).toBe(true)
    expect(canAdminEditSettlement('clarification_requested')).toBe(true)
    expect(canAdminEditSettlement('pending_guide_confirmation')).toBe(false)
  })
})

describe('canAdminDirectApprove', () => {
  it('is always false in the v1 workflow', () => {
    expect(canAdminDirectApprove('submitted')).toBe(false)
    expect(canAdminDirectApprove('pending_guide_confirmation')).toBe(false)
  })
})

describe('canAdminReject', () => {
  it('is always false in the v1 workflow', () => {
    expect(canAdminReject('submitted', 'admin')).toBe(false)
    expect(canAdminReject('submitted', 'master_admin')).toBe(false)
  })
})

describe('canAdminPaySettlement', () => {
  it('allows pending_guide_confirmation when guide confirmed', () => {
    expect(
      canAdminPaySettlement({
        ...base,
        status: 'pending_guide_confirmation',
        guide_confirmed_at: '2026-05-27T00:00:00Z',
      }),
    ).toBe(true)
  })

  it('blocks pending_guide_confirmation before guide confirmation', () => {
    expect(
      canAdminPaySettlement({
        ...base,
        status: 'pending_guide_confirmation',
        guide_submit_snapshot_id: 'snap-1',
        guide_confirmed_at: null,
      }),
    ).toBe(false)
  })

  it('allows legacy approved without snapshot', () => {
    expect(canAdminPaySettlement({ ...base, status: 'approved' })).toBe(true)
  })

  it('blocks legacy approved when snapshot exists but guide has not confirmed', () => {
    expect(
      canAdminPaySettlement({
        ...base,
        status: 'approved',
        guide_submit_snapshot_id: 'snap-1',
        guide_confirmed_at: null,
      }),
    ).toBe(false)
  })
})

describe('canGuideRequestClarification', () => {
  it('allows only pending_guide_confirmation for owner before guide confirms', () => {
    expect(
      canGuideRequestClarification(
        { status: 'pending_guide_confirmation', guide_id: 'guide-1', guide_confirmed_at: null },
        'guide-1',
      ),
    ).toBe(true)
    expect(
      canGuideRequestClarification({ status: 'submitted', guide_id: 'guide-1', guide_confirmed_at: null }, 'guide-1'),
    ).toBe(false)
  })
})

describe('canAdminSendForConfirmation', () => {
  it('allows submitted and legacy clarification_requested only', () => {
    expect(canAdminSendForConfirmation('submitted')).toBe(true)
    expect(canAdminSendForConfirmation('clarification_requested')).toBe(true)
    expect(canAdminSendForConfirmation('pending_guide_confirmation')).toBe(false)
    expect(canAdminSendForConfirmation('paid')).toBe(false)
  })
})

describe('assertAdminSendForConfirmation', () => {
  it('requires guide submit snapshot', () => {
    expect(assertAdminSendForConfirmation('submitted', null).ok).toBe(false)
    expect(assertAdminSendForConfirmation('submitted', 'snap-1').ok).toBe(true)
    expect(assertAdminSendForConfirmation('paid', 'snap-1').ok).toBe(false)
  })
})

describe('assertGuideConfirmAction', () => {
  it('allows confirm only for owner in pending_guide_confirmation', () => {
    expect(
      assertGuideConfirmAction(
        { status: 'pending_guide_confirmation', guide_id: 'guide-1' },
        'guide-1',
        'confirm',
      ).ok,
    ).toBe(true)
    expect(
      assertGuideConfirmAction(
        { status: 'pending_guide_confirmation', guide_id: 'guide-1' },
        'guide-2',
        'confirm',
      ).ok,
    ).toBe(false)
  })
})

describe('assertAdminReviewAction', () => {
  it('blocks deprecated approve and reject actions', () => {
    expect(
      assertAdminReviewAction({ ...base, status: 'pending_guide_confirmation' }, 'approve', 'master_admin')
        .ok,
    ).toBe(false)
    expect(assertAdminReviewAction({ ...base, status: 'submitted' }, 'reject', 'admin').ok).toBe(false)
  })

  it('allows admin pay from pending_guide_confirmation after guide confirmation', () => {
    expect(
      assertAdminReviewAction(
        {
          ...base,
          status: 'pending_guide_confirmation',
          guide_confirmed_at: '2026-05-27T00:00:00Z',
        },
        'pay',
        'admin',
      ).ok,
    ).toBe(true)
    expect(
      assertAdminReviewAction(
        {
          ...base,
          status: 'pending_guide_confirmation',
          guide_confirmed_at: '2026-05-27T00:00:00Z',
        },
        'pay',
        'master_admin',
      ).ok,
    ).toBe(true)
  })

  it('blocks pay before guide confirmation', () => {
    expect(
      assertAdminReviewAction(
        { ...base, status: 'pending_guide_confirmation', guide_submit_snapshot_id: 'snap-1' },
        'pay',
        'admin',
      ).ok,
    ).toBe(false)
  })

  it('blocks admin mutations after payment', () => {
    expect(assertAdminReviewAction({ ...base, status: 'paid' }, 'request_edit', 'admin').ok).toBe(false)
  })

  it('allows master reopen from paid', () => {
    expect(assertAdminReviewAction({ ...base, status: 'paid' }, 'reopen', 'master_admin').ok).toBe(true)
    expect(assertAdminReviewAction({ ...base, status: 'paid' }, 'reopen', 'admin').ok).toBe(false)
  })
})

describe('role-scoped operational actions', () => {
  it('allows admin tier for send/reject/edit gates', () => {
    expect(canAdminSendForConfirmation('submitted', 'admin')).toBe(true)
    expect(canAdminSendForConfirmation('submitted', 'master_admin')).toBe(true)
    expect(canAdminSendForConfirmation('submitted', 'guide')).toBe(false)
  })
})
