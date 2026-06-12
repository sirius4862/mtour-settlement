import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertAdminReviewAction,
  assertGuideConfirmAction,
  canAdminPaySettlement,
  canAdminRequestEditOnSettlement,
  canMarkSettlementPaidForRole,
  canMasterReopenFinalConfirmed,
  canRecallSettlement,
  isGuideFinalConfirmedSettlement,
} from './status-guards'
import type { SettlementStatus } from '@/types'

const ROOT = process.cwd()
const ACTIONS = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')
const CONFIRM_PANEL = readFileSync(
  join(ROOT, 'src/app/guide/settlements/[id]/confirm/ConfirmPanel.tsx'),
  'utf8',
)
const REVIEW_PANEL = readFileSync(
  join(ROOT, 'src/app/admin/settlements/[id]/ReviewPanel.tsx'),
  'utf8',
)
const DETAIL_PAGE = readFileSync(join(ROOT, 'src/app/admin/settlements/[id]/page.tsx'), 'utf8')

function guideConfirmBody(): string {
  const start = ACTIONS.indexOf('export async function guideConfirm')
  const end = ACTIONS.indexOf('export async function guideRequestClarification', start)
  return ACTIONS.slice(start, end)
}

const finalConfirmedUnpaid = {
  status: 'pending_guide_confirmation' as SettlementStatus,
  guide_confirmed_at: '2026-05-27T00:00:00Z',
  guide_submit_snapshot_id: 'snap-1',
}

const pendingUnconfirmed = {
  status: 'pending_guide_confirmation' as SettlementStatus,
  guide_confirmed_at: null,
  guide_submit_snapshot_id: 'snap-1',
}

const paidCompleted = {
  status: 'paid' as SettlementStatus,
  guide_confirmed_at: '2026-05-27T00:00:00Z',
  guide_submit_snapshot_id: 'snap-1',
}

describe('guideConfirm server action wiring', () => {
  const body = guideConfirmBody()

  it('loads confirmation packet snapshot instead of full getSettlementFull', () => {
    expect(body).toContain('GUIDE_READ.settlement_confirmations')
    expect(body).toContain('snapshot_after_id')
    expect(body).toContain('parseSnapshotPayload')
    expect(body).not.toMatch(/guideConfirm[\s\S]*getSettlementFull/)
  })

  it('calls guide_confirm_settlement RPC and verifies guide_confirmed_at', () => {
    expect(body).toContain("rpc('guide_confirm_settlement'")
    expect(body).toContain('guide_confirmed_at, guide_confirmed_by')
    expect(body).toContain('확인 시각이 저장되지 않았습니다')
  })

  it('verifies exactly one pending confirmation row is confirmed', () => {
    expect(body).toContain("from('settlement_confirmations')")
    expect(body).toContain('.select(\'id\')')
    expect(body).toContain('assertSingleOptimisticUpdate(confRows)')
  })

  it('blocks double confirmation when guide_confirmed_at is already set', () => {
    expect(body).toContain('if (current.guide_confirmed_at)')
    expect(body).toContain('이미 최종확인(이상없음) 처리되었습니다.')
  })

  it('blocks non-owner guides via assertGuideConfirmAction', () => {
    expect(body).toContain('assertGuideConfirmAction')
  })
})

describe('guide confirm UI — ConfirmPanel', () => {
  it('surfaces server errors instead of swallowing them', () => {
    expect(CONFIRM_PANEL).toContain('try {')
    expect(CONFIRM_PANEL).toContain('catch (err)')
    expect(CONFIRM_PANEL).toContain('setError(res.error')
    expect(CONFIRM_PANEL).toContain('setError(err instanceof Error')
  })

  it('redirects and refreshes after successful approval (clears processing state)', () => {
    const handleStart = CONFIRM_PANEL.indexOf('const handleConfirm = () => {')
    const handleEnd = CONFIRM_PANEL.indexOf('const handleClarify = () => {', handleStart)
    const handleConfirm = CONFIRM_PANEL.slice(handleStart, handleEnd)
    expect(handleConfirm).toContain('guideConfirm(settlementId)')
    expect(handleConfirm).toContain('if (res.ok)')
    expect(handleConfirm).toContain('router.push')
    expect(handleConfirm).toContain('router.refresh()')
    expect(handleConfirm).toContain("setError(res.error")
  })
})

describe('assertGuideConfirmAction — access control', () => {
  it('allows assigned guide in pending_guide_confirmation', () => {
    expect(
      assertGuideConfirmAction(
        { status: 'pending_guide_confirmation', guide_id: 'guide-1' },
        'guide-1',
        'confirm',
      ).ok,
    ).toBe(true)
  })

  it('denies non-assigned guide', () => {
    const res = assertGuideConfirmAction(
      { status: 'pending_guide_confirmation', guide_id: 'guide-1' },
      'guide-2',
      'confirm',
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('본인에게 배정된')
  })
})

describe('final-confirmed unpaid detection', () => {
  it('uses pending_guide_confirmation + guide_confirmed_at', () => {
    expect(isGuideFinalConfirmedSettlement(finalConfirmedUnpaid)).toBe(true)
    expect(isGuideFinalConfirmedSettlement(pendingUnconfirmed)).toBe(false)
  })
})

describe('admin 지급완료 처리 visibility — guards', () => {
  it('shows pay for final-confirmed unpaid (admin + master)', () => {
    expect(canAdminPaySettlement(finalConfirmedUnpaid)).toBe(true)
    expect(canMarkSettlementPaidForRole('admin', finalConfirmedUnpaid)).toBe(true)
    expect(canMarkSettlementPaidForRole('master_admin', finalConfirmedUnpaid)).toBe(true)
  })

  it('shows 수정요청 for final-confirmed unpaid', () => {
    expect(canAdminRequestEditOnSettlement(finalConfirmedUnpaid, 'admin')).toBe(true)
    expect(canAdminRequestEditOnSettlement(finalConfirmedUnpaid, 'master_admin')).toBe(true)
  })

  it('does not show 정산 재오픈 or 회수 for final-confirmed unpaid', () => {
    expect(canMasterReopenFinalConfirmed(finalConfirmedUnpaid, 'master_admin')).toBe(false)
    expect(canRecallSettlement(finalConfirmedUnpaid, 'admin')).toBe(false)
  })

  it('hides pay before guide confirms', () => {
    expect(canMarkSettlementPaidForRole('admin', pendingUnconfirmed)).toBe(false)
    expect(assertAdminReviewAction(pendingUnconfirmed, 'pay', 'admin').ok).toBe(false)
  })
})

describe('admin 지급완료 처리 — reviewSettlement pay transition', () => {
  const reviewStart = ACTIONS.indexOf("case 'pay':")
  const reviewEnd = ACTIONS.indexOf('const { data: updatedRows, error }', reviewStart)
  const payCase = ACTIONS.slice(reviewStart, reviewEnd)

  it('transitions final-confirmed unpaid to paid and sets paid_at', () => {
    expect(payCase).toContain("updates.status = 'paid'")
    expect(payCase).toContain('updates.paid_at = now')
    expect(payCase).toContain("auditAction = 'admin_pay'")
  })

  it('allows pay from guide-final-confirmed pending_guide_confirmation', () => {
    expect(
      assertAdminReviewAction(finalConfirmedUnpaid, 'pay', 'admin').ok,
    ).toBe(true)
  })
})

describe('paid settlement admin actions', () => {
  it('shows MASTER_ADMIN-only 정산 재오픈', () => {
    expect(canMasterReopenFinalConfirmed(paidCompleted, 'master_admin')).toBe(true)
    expect(canMasterReopenFinalConfirmed(paidCompleted, 'admin')).toBe(false)
    expect(REVIEW_PANEL).toContain('canReopenFinalConfirmed')
    expect(REVIEW_PANEL).toContain('정산 재오픈')
  })

  it('does not show normal 수정요청 or 회수 on paid', () => {
    expect(canAdminRequestEditOnSettlement(paidCompleted, 'admin')).toBe(false)
    expect(canAdminRequestEditOnSettlement(paidCompleted, 'master_admin')).toBe(false)
    expect(canRecallSettlement(paidCompleted, 'admin')).toBe(false)
    expect(assertAdminReviewAction(paidCompleted, 'pay', 'admin').ok).toBe(false)
  })
})

describe('admin detail page wiring', () => {
  it('wires canPay with guide_confirmed_at for final-confirmed unpaid', () => {
    expect(DETAIL_PAGE).toContain('canMarkSettlementPaidForRole')
    expect(DETAIL_PAGE).toContain('guide_confirmed_at: s.guide_confirmed_at')
    expect(DETAIL_PAGE).toContain('canPay={canPay}')
  })

  it('renders 지급완료 처리 button when canPay', () => {
    expect(REVIEW_PANEL).toContain('지급완료 처리')
    expect(REVIEW_PANEL).toContain('canPay &&')
    expect(REVIEW_PANEL).toContain("handleReview('pay')")
  })
})

describe('waiting states — no admin action panel', () => {
  it('edit_requested has no request_edit, pay, or reopen eligibility', () => {
    const row = {
      status: 'edit_requested' as SettlementStatus,
      guide_confirmed_at: null,
      guide_submit_snapshot_id: null,
    }
    expect(canAdminRequestEditOnSettlement(row, 'admin')).toBe(false)
    expect(canMarkSettlementPaidForRole('admin', row)).toBe(false)
    expect(canMasterReopenFinalConfirmed(row, 'master_admin')).toBe(false)
  })

  it('unconfirmed pending_guide_confirmation has no request_edit or pay', () => {
    expect(canAdminRequestEditOnSettlement(pendingUnconfirmed, 'admin')).toBe(false)
    expect(canMarkSettlementPaidForRole('admin', pendingUnconfirmed)).toBe(false)
    expect(canMasterReopenFinalConfirmed(pendingUnconfirmed, 'master_admin')).toBe(false)
  })

  it('detail page hides ReviewPanel when all action flags are false', () => {
    expect(DETAIL_PAGE).toMatch(
      /canSendForConfirmation \|\| canReqEdit \|\| canPay \|\| canReopenFinalConfirmed/,
    )
  })
})

describe('assignment recall unchanged', () => {
  const tourActions = readFileSync(join(ROOT, 'src/lib/actions/tourActions.ts'), 'utf8')

  it('tour recall still calls recall_tour_vehicle_cleanup RPC', () => {
    expect(tourActions).toContain('recall_tour_vehicle_cleanup')
    expect(tourActions).toContain('recallTourAssignment')
  })

  it('settlement recall remains disabled on admin detail', () => {
    expect(REVIEW_PANEL).not.toContain('recallSettlement')
    expect(DETAIL_PAGE).not.toContain('canRecallSettlement')
  })
})
