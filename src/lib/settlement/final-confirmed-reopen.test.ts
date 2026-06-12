import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertCanMasterReopenFinalConfirmed,
  assertCanRecallSettlement,
  canAdminEditSettlement,
  canAdminOrMasterAdminEditSettlement,
  canAdminRequestEditOnSettlement,
  canMasterReopenFinalConfirmed,
  canRecallSettlement,
  FINAL_CONFIRMED_REOPEN_TARGET_STATUS,
  isGuideFinalConfirmedSettlement,
  RECALL_TARGET_STATUS,
} from './status-guards'
import { normalizeStatusForDashboard } from '@/lib/admin/settlement-list'
import type { SettlementStatus } from '@/types'

const ROOT = process.cwd()

const PAID_REOPEN_CONFIRM_COPY =
  '이 작업은 지급완료 상태를 해제하고 관리자 수정 상태로 되돌립니다. 계속하시겠습니까?'

const finalConfirmedPending = {
  status: 'pending_guide_confirmation' as SettlementStatus,
  guide_confirmed_at: '2026-05-27T00:00:00Z',
  guide_submit_snapshot_id: 'snap-1',
}

const finalConfirmedLegacy = {
  status: 'approved' as SettlementStatus,
  guide_confirmed_at: '2026-05-27T00:00:00Z',
  guide_submit_snapshot_id: null,
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

describe('isGuideFinalConfirmedSettlement', () => {
  it('detects pending_guide_confirmation after guide confirms', () => {
    expect(isGuideFinalConfirmedSettlement(finalConfirmedPending)).toBe(true)
  })

  it('detects legacy approved rows', () => {
    expect(isGuideFinalConfirmedSettlement(finalConfirmedLegacy)).toBe(true)
  })

  it('is false before guide confirms', () => {
    expect(isGuideFinalConfirmedSettlement(pendingUnconfirmed)).toBe(false)
  })
})

describe('canMasterReopenFinalConfirmed — paid-completed only', () => {
  it('allows master_admin on paid-completed settlements', () => {
    expect(canMasterReopenFinalConfirmed(paidCompleted, 'master_admin')).toBe(true)
    expect(assertCanMasterReopenFinalConfirmed(paidCompleted, 'master_admin')).toEqual({ ok: true })
  })

  it('denies unpaid final-confirmed settlements', () => {
    expect(canMasterReopenFinalConfirmed(finalConfirmedPending, 'master_admin')).toBe(false)
    expect(canMasterReopenFinalConfirmed(finalConfirmedLegacy, 'master_admin')).toBe(false)
    const res = assertCanMasterReopenFinalConfirmed(finalConfirmedPending, 'master_admin')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('지급 완료된 정산서만 정산 재오픈할 수 있습니다.')
  })

  it('denies regional admin on paid-completed settlements', () => {
    expect(canMasterReopenFinalConfirmed(paidCompleted, 'admin')).toBe(false)
    expect(assertCanMasterReopenFinalConfirmed(paidCompleted, 'admin').ok).toBe(false)
  })

  it('denies guide on paid-completed settlements', () => {
    expect(canMasterReopenFinalConfirmed(paidCompleted, 'guide')).toBe(false)
  })

  it('denies guide-waiting statuses', () => {
    expect(
      canMasterReopenFinalConfirmed(
        { status: 'edit_requested', guide_confirmed_at: null },
        'master_admin',
      ),
    ).toBe(false)
    expect(canMasterReopenFinalConfirmed(pendingUnconfirmed, 'master_admin')).toBe(false)
  })
})

describe('admin correction workflow by settlement state', () => {
  it('edit_requested: no recall, reopen, or duplicate request_edit', () => {
    const row = { status: 'edit_requested' as SettlementStatus, guide_confirmed_at: null }
    expect(canRecallSettlement(row, 'admin')).toBe(false)
    expect(canMasterReopenFinalConfirmed(row, 'master_admin')).toBe(false)
    expect(canAdminRequestEditOnSettlement(row, 'admin')).toBe(false)
  })

  it('unconfirmed pending_guide_confirmation: admin waits — no request_edit or reopen', () => {
    expect(canAdminRequestEditOnSettlement(pendingUnconfirmed, 'admin')).toBe(false)
    expect(canMasterReopenFinalConfirmed(pendingUnconfirmed, 'master_admin')).toBe(false)
    expect(canRecallSettlement(pendingUnconfirmed, 'admin')).toBe(false)
  })

  it('final-confirmed unpaid: allows 수정요청, not 정산 재오픈 or 회수', () => {
    expect(canAdminRequestEditOnSettlement(finalConfirmedPending, 'admin')).toBe(true)
    expect(canAdminRequestEditOnSettlement(finalConfirmedPending, 'master_admin')).toBe(true)
    expect(canMasterReopenFinalConfirmed(finalConfirmedPending, 'master_admin')).toBe(false)
    expect(canRecallSettlement(finalConfirmedPending, 'admin')).toBe(false)
  })

  it('paid-completed: allows 정산 재오픈 for master only, not 수정요청', () => {
    expect(canMasterReopenFinalConfirmed(paidCompleted, 'master_admin')).toBe(true)
    expect(canMasterReopenFinalConfirmed(paidCompleted, 'admin')).toBe(false)
    expect(canAdminRequestEditOnSettlement(paidCompleted, 'admin')).toBe(false)
    expect(canAdminRequestEditOnSettlement(paidCompleted, 'master_admin')).toBe(false)
  })
})

describe('paid reopen vs assignment recall', () => {
  it('does not offer recall (회수) on guide-final-confirmed settlements', () => {
    expect(canRecallSettlement(finalConfirmedPending, 'admin')).toBe(false)
    expect(canRecallSettlement(finalConfirmedPending, 'master_admin')).toBe(false)
    expect(assertCanRecallSettlement(finalConfirmedPending, 'admin').ok).toBe(false)
  })

  it('does not allow settlement recall while guide confirmation is pending', () => {
    expect(canRecallSettlement(pendingUnconfirmed, 'admin')).toBe(false)
    expect(canRecallSettlement(pendingUnconfirmed, 'master_admin')).toBe(false)
  })

  it('does not allow settlement recall on edit_requested', () => {
    expect(
      canRecallSettlement(
        { status: 'edit_requested', guide_confirmed_at: null },
        'admin',
      ),
    ).toBe(false)
    expect(
      canRecallSettlement(
        { status: 'edit_requested', guide_confirmed_at: null },
        'master_admin',
      ),
    ).toBe(false)
  })

  it('reopen target is admin-editable submitted', () => {
    expect(FINAL_CONFIRMED_REOPEN_TARGET_STATUS).toBe('submitted')
    expect(RECALL_TARGET_STATUS).toBe('submitted')
    expect(canAdminEditSettlement(FINAL_CONFIRMED_REOPEN_TARGET_STATUS)).toBe(true)
  })

  it('reopened paid settlement moves to submitted dashboard bucket', () => {
    expect(normalizeStatusForDashboard('paid')).toBe('paid')
    expect(normalizeStatusForDashboard(FINAL_CONFIRMED_REOPEN_TARGET_STATUS)).toBe('submitted')
  })

  it('reopened settlement is admin-editable immediately for admin and master_admin', () => {
    expect(canAdminEditSettlement(FINAL_CONFIRMED_REOPEN_TARGET_STATUS)).toBe(true)
    expect(canAdminOrMasterAdminEditSettlement(FINAL_CONFIRMED_REOPEN_TARGET_STATUS, 'admin')).toBe(
      true,
    )
    expect(
      canAdminOrMasterAdminEditSettlement(FINAL_CONFIRMED_REOPEN_TARGET_STATUS, 'master_admin'),
    ).toBe(true)
  })
})

describe('admin settlement detail UI wiring', () => {
  const reviewPanel = readFileSync(
    join(ROOT, 'src/app/admin/settlements/[id]/ReviewPanel.tsx'),
    'utf8',
  )
  const detailPage = readFileSync(join(ROOT, 'src/app/admin/settlements/[id]/page.tsx'), 'utf8')

  it('renders 정산 재오픈 card for master-admin paid-completed reopen', () => {
    expect(reviewPanel).toContain('정산 재오픈')
    expect(reviewPanel).toContain('지급완료된 정산서를 다시 관리자 수정 상태로 되돌립니다.')
    expect(reviewPanel).toContain('재오픈 사유 (선택)')
    expect(reviewPanel).toContain(PAID_REOPEN_CONFIRM_COPY)
    expect(reviewPanel).toContain('reopenFinalConfirmedSettlementForAdminCorrection')
    expect(reviewPanel).toContain('canReopenFinalConfirmed')
  })

  it('does not render duplicate 지급 재오픈 button', () => {
    expect(reviewPanel).not.toContain('지급 재오픈')
    expect(reviewPanel).not.toContain('canReopen=')
    expect(reviewPanel).not.toContain("action: 'reopen'")
    expect(detailPage).not.toContain('canMasterReopenPaid')
    expect(detailPage).not.toContain('canReopen={')
  })

  it('does not use 회수 wording on the paid reopen card', () => {
    const reopenCardStart = reviewPanel.indexOf('canReopenFinalConfirmed &&')
    const reopenCardEnd = reviewPanel.indexOf('<textarea', reopenCardStart)
    const reopenCard = reviewPanel.slice(reopenCardStart, reopenCardEnd)
    expect(reopenCard).not.toContain('회수')
    expect(reopenCard).not.toContain('배정 회수')
  })

  it('does not render settlement recall/cancel actions on admin detail', () => {
    expect(reviewPanel).not.toContain('recallSettlement')
    expect(reviewPanel).not.toContain('회수')
    expect(reviewPanel).not.toContain('수정요청 취소')
    expect(reviewPanel).not.toContain('수정요청 철회')
    expect(reviewPanel).not.toContain('최종확인 요청 취소')
    expect(reviewPanel).not.toContain('가이드 확인요청 취소')
    expect(detailPage).not.toContain('canRecallSettlement')
    expect(detailPage).not.toContain('canRecall=')
  })

  it('guide-waiting statuses have no reopen eligibility', () => {
    const guideWaitingStatuses = ['edit_requested', 'pending_guide_confirmation'] as const
    for (const status of guideWaitingStatuses) {
      expect(canRecallSettlement({ status, guide_confirmed_at: null }, 'admin')).toBe(false)
      expect(canMasterReopenFinalConfirmed({ status, guide_confirmed_at: null }, 'master_admin')).toBe(
        false,
      )
    }
  })

  it('wires canMasterReopenFinalConfirmed on the detail page', () => {
    expect(detailPage).toContain('canMasterReopenFinalConfirmed')
    expect(detailPage).toContain('canReopenFinalConfirmed={canReopenFinalConfirmed}')
  })

  it('wires canAdminRequestEditOnSettlement on the detail page', () => {
    expect(detailPage).toContain('canAdminRequestEditOnSettlement')
    expect(detailPage).toContain('guide_confirmed_at: s.guide_confirmed_at')
    expect(detailPage).toContain('canRequestEdit={canReqEdit}')
  })

  it('navigates to admin edit route after successful reopen (not detail refresh)', () => {
    const handleStart = reviewPanel.indexOf('const handleFinalReopen = () => {')
    const handleEnd = reviewPanel.indexOf('const showActions =', handleStart)
    const handleFinalReopen = reviewPanel.slice(handleStart, handleEnd)
    expect(handleFinalReopen).toContain('router.push')
    expect(handleFinalReopen).toContain('res.redirectTo')
    expect(handleFinalReopen).toContain('adminSettlementEditPath(settlementId)')
    expect(handleFinalReopen).not.toContain('router.refresh')
  })
})

describe('reopenFinalConfirmedSettlementForAdminCorrection server action', () => {
  const source = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')
  const start = source.indexOf(
    'export async function reopenFinalConfirmedSettlementForAdminCorrection',
  )
  const end = source.indexOf('// ── 확인 워크플로', start)
  const body = source.slice(start, end)

  it('is master_admin only and guarded separately from recallSettlement', () => {
    expect(body).toContain("profile.role !== 'master_admin'")
    expect(body).toContain('assertCanMasterReopenFinalConfirmed')
    expect(body).toContain('requireAdminSettlementRegionAccess')
    expect(body).not.toContain('assertCanRecallSettlement')
  })

  it('rejects unpaid final-confirmed via assertCanMasterReopenFinalConfirmed guard', () => {
    expect(body).toContain('assertCanMasterReopenFinalConfirmed')
    expect(body).toContain('if (!guard.ok) return { ok: false, error: guard.error }')
  })

  it('moves paid to submitted and clears guide confirmation pointers only', () => {
    expect(body).toContain('status: FINAL_CONFIRMED_REOPEN_TARGET_STATUS')
    expect(body).toContain('guide_confirmed_at: null')
    expect(body).toContain('guide_confirmed_by: null')
    expect(body).toContain('active_confirmation_id: null')
    expect(body).not.toContain('.delete(')
    expect(body).not.toContain('paid_at: null')
  })

  it('records audit trail with paid reopen reason', () => {
    expect(body).toContain("action: 'status_change'")
    expect(body).toContain('master_reopen_paid_correction')
  })

  it('returns admin edit redirect target on success', () => {
    const routes = readFileSync(join(ROOT, 'src/lib/admin/settlement-routes.ts'), 'utf8')
    expect(body).toContain('adminSettlementEditPath')
    expect(body).toContain('redirectTo: adminSettlementEditPath(id)')
    expect(routes).toContain('/admin/settlements/${settlementId}/edit')
  })

  it('does not touch submit RPC, payout, or vehicle report paths', () => {
    expect(body).not.toContain('.rpc(')
    expect(body).not.toContain('vehicle_route_reports')
    expect(body).not.toContain('saveSettlement')
  })
})

describe('recallSettlement unchanged for assignment-recall semantics', () => {
  const source = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')
  const start = source.indexOf('export async function recallSettlement')
  const end = source.indexOf('export async function reopenFinalConfirmedSettlementForAdminCorrection', start)
  const body = source.slice(start, end)

  it('still uses RECALL_TARGET_STATUS and assertCanRecallSettlement', () => {
    expect(body).toContain('assertCanRecallSettlement')
    expect(body).toContain('RECALL_TARGET_STATUS')
    expect(body).toContain('admin_recall')
  })
})

describe('reviewSettlement request_edit from final-confirmed unpaid', () => {
  const source = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')
  const start = source.indexOf("case 'request_edit':")
  const end = source.indexOf("case 'pay':", start)
  const body = source.slice(start, end)

  it('clears guide confirmation pointers when reopening correction before payment', () => {
    expect(body).toContain('isGuideFinalConfirmedSettlement')
    expect(body).toContain('updates.guide_confirmed_at = null')
    expect(body).toContain('updates.guide_confirmed_by = null')
    expect(body).toContain('updates.active_confirmation_id = null')
    expect(body).toContain("updates.status = 'edit_requested'")
    expect(body).not.toContain('paid_at: null')
  })
})

describe('reviewSettlement paid reopen path unchanged', () => {
  const source = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')
  const start = source.indexOf("if (params.action === 'reopen')")
  const end = source.indexOf('const updates: Record<string, unknown>', start)
  const body = source.slice(start, end)

  it('still reopens paid settlements to edit_requested only', () => {
    expect(body).toContain(".eq('status', 'paid')")
    expect(body).toContain("status: 'edit_requested'")
    expect(body).toContain('master_reopen_paid')
  })
})
