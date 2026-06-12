import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertCanMasterReopenFinalConfirmed,
  assertCanRecallSettlement,
  canAdminEditSettlement,
  canAdminOrMasterAdminEditSettlement,
  canMasterReopenFinalConfirmed,
  canRecallSettlement,
  FINAL_CONFIRMED_REOPEN_TARGET_STATUS,
  isGuideFinalConfirmedSettlement,
  RECALL_TARGET_STATUS,
} from './status-guards'
import { normalizeStatusForDashboard } from '@/lib/admin/settlement-list'
import type { SettlementStatus } from '@/types'

const ROOT = process.cwd()

const FINAL_CONFIRMED_REOPEN_CONFIRM_COPY =
  '이 작업은 최종확인 완료 상태를 해제하고 관리자 수정 상태로 되돌립니다. 계속하시겠습니까?'

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

describe('canMasterReopenFinalConfirmed', () => {
  it('allows master_admin on final-confirmed settlements', () => {
    expect(canMasterReopenFinalConfirmed(finalConfirmedPending, 'master_admin')).toBe(true)
    expect(canMasterReopenFinalConfirmed(finalConfirmedLegacy, 'master_admin')).toBe(true)
  })

  it('denies regional admin', () => {
    expect(canMasterReopenFinalConfirmed(finalConfirmedPending, 'admin')).toBe(false)
    expect(assertCanMasterReopenFinalConfirmed(finalConfirmedPending, 'admin').ok).toBe(false)
  })

  it('denies guide', () => {
    expect(canMasterReopenFinalConfirmed(finalConfirmedPending, 'guide')).toBe(false)
  })

  it('denies paid settlements (use 지급 재오픈 instead)', () => {
    expect(
      canMasterReopenFinalConfirmed(
        { status: 'paid', guide_confirmed_at: '2026-05-27T00:00:00Z' },
        'master_admin',
      ),
    ).toBe(false)
  })
})

describe('final-confirmed reopen vs assignment recall', () => {
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

  it('reopen target is admin-editable submitted, same family as recall target', () => {
    expect(FINAL_CONFIRMED_REOPEN_TARGET_STATUS).toBe('submitted')
    expect(RECALL_TARGET_STATUS).toBe('submitted')
    expect(canAdminEditSettlement(FINAL_CONFIRMED_REOPEN_TARGET_STATUS)).toBe(true)
  })

  it('reopened settlement leaves the 최종확인 dashboard bucket', () => {
    expect(normalizeStatusForDashboard('pending_guide_confirmation')).toBe(
      'pending_guide_confirmation',
    )
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

  it('renders 정산 재오픈 card for master-admin final-confirmed reopen', () => {
    expect(reviewPanel).toContain('정산 재오픈')
    expect(reviewPanel).toContain('재오픈 사유 (선택)')
    expect(reviewPanel).toContain(FINAL_CONFIRMED_REOPEN_CONFIRM_COPY)
    expect(reviewPanel).toContain('reopenFinalConfirmedSettlementForAdminCorrection')
    expect(reviewPanel).toContain('canReopenFinalConfirmed')
  })

  it('does not use 회수 wording on the final-confirmed reopen card', () => {
    const reopenCardStart = reviewPanel.indexOf('canReopenFinalConfirmed &&')
    const reopenCardEnd = reviewPanel.indexOf('<textarea', reopenCardStart)
    const reopenCard = reviewPanel.slice(reopenCardStart, reopenCardEnd)
    expect(reopenCard).not.toContain('회수')
    expect(reopenCard).not.toContain('배정 회수')
  })

  it('does not render settlement recall/cancel actions on admin detail', () => {
    expect(reviewPanel).not.toContain('canRecall')
    expect(reviewPanel).not.toContain('recallSettlement')
    expect(reviewPanel).not.toContain('회수')
    expect(reviewPanel).not.toContain('수정요청 취소')
    expect(reviewPanel).not.toContain('수정요청 철회')
    expect(reviewPanel).not.toContain('최종확인 요청 취소')
    expect(reviewPanel).not.toContain('가이드 확인요청 취소')
    expect(detailPage).not.toContain('canRecallSettlement')
    expect(detailPage).not.toContain('canRecall=')
  })

  it('hides ReviewPanel for guide-waiting statuses (admin read-only wait)', () => {
    const guideWaitingStatuses = ['edit_requested', 'pending_guide_confirmation'] as const
    for (const status of guideWaitingStatuses) {
      expect(canRecallSettlement({ status, guide_confirmed_at: null }, 'admin')).toBe(false)
      expect(canRecallSettlement({ status, guide_confirmed_at: null }, 'master_admin')).toBe(false)
    }
  })

  it('wires canMasterReopenFinalConfirmed on the detail page', () => {
    expect(detailPage).toContain('canMasterReopenFinalConfirmed')
    expect(detailPage).toContain('canReopenFinalConfirmed={canReopenFinalConfirmed}')
  })

  it('navigates to admin edit route after successful reopen (not detail refresh)', () => {
    const handleStart = reviewPanel.indexOf('const handleFinalReopen = () => {')
    const handleEnd = reviewPanel.indexOf('const showActions =', handleStart)
    const handleFinalReopen = reviewPanel.slice(handleStart, handleEnd)
    expect(handleFinalReopen).toContain('router.push')
    expect(handleFinalReopen).toContain('res.redirectTo')
    expect(handleFinalReopen).toContain('adminSettlementEditPath(settlementId)')
    expect(handleFinalReopen).not.toContain('router.refresh')
    expect(handleFinalReopen).not.toContain('/guide/settlements')
    expect(handleFinalReopen).not.toContain('/admin/tours')
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

  it('moves to submitted and clears guide confirmation pointers only', () => {
    expect(body).toContain('status: FINAL_CONFIRMED_REOPEN_TARGET_STATUS')
    expect(body).toContain('guide_confirmed_at: null')
    expect(body).toContain('guide_confirmed_by: null')
    expect(body).toContain('active_confirmation_id: null')
    expect(body).not.toContain('.delete(')
    expect(body).not.toContain('paid_at')
  })

  it('records audit trail with reopen reason', () => {
    expect(body).toContain("action: 'status_change'")
    expect(body).toContain('master_reopen_final_confirmed')
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

describe('paid reopen path unchanged', () => {
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
