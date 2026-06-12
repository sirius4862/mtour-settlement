import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertCanRecallSettlement,
  canAdminEditSettlement,
  canAdminSendForConfirmation,
  canGuideConfirm,
  canGuideEdit,
  canRecallSettlement,
  RECALL_ELIGIBLE_STATUSES,
  RECALL_TARGET_STATUS,
} from './status-guards'
import { assertAdminCanAccessSettlementBranch } from '@/lib/region/settlement-access'
import { MTOUR_REGION_CODES } from '@/lib/region/regions'
import type { SettlementStatus, UserRole } from '@/types'

const pendingUnconfirmed = {
  status: 'pending_guide_confirmation' as SettlementStatus,
  guide_confirmed_at: null as string | null,
}
const pendingConfirmed = {
  status: 'pending_guide_confirmation' as SettlementStatus,
  guide_confirmed_at: '2026-05-27T00:00:00Z' as string | null,
}
const editRequested = {
  status: 'edit_requested' as SettlementStatus,
  guide_confirmed_at: null as string | null,
}

describe('canRecallSettlement — eligibility', () => {
  it('does not offer settlement recall once admin sent 수정요청 (edit_requested)', () => {
    expect(canRecallSettlement(editRequested, 'admin')).toBe(false)
    expect(canRecallSettlement(editRequested, 'master_admin')).toBe(false)
  })

  it('does not offer settlement recall while guide final confirmation is pending', () => {
    expect(canRecallSettlement(pendingUnconfirmed, 'admin')).toBe(false)
    expect(canRecallSettlement(pendingUnconfirmed, 'master_admin')).toBe(false)
  })

  it('guide can never recall', () => {
    expect(canRecallSettlement(pendingUnconfirmed, 'guide')).toBe(false)
    expect(canRecallSettlement(editRequested, 'guide')).toBe(false)
  })

  it('cannot recall once the guide has given final confirmation (지급가능)', () => {
    expect(canRecallSettlement(pendingConfirmed, 'admin')).toBe(false)
    expect(canRecallSettlement(pendingConfirmed, 'master_admin')).toBe(false)
  })

  it('cannot recall paid / finalized / admin-only / draft statuses', () => {
    const blocked: SettlementStatus[] = [
      'paid',
      'approved',
      'draft',
      'submitted',
      'rejected',
      'clarification_requested',
      'edit_requested',
      'pending_guide_confirmation',
    ]
    for (const status of blocked) {
      expect(canRecallSettlement({ status, guide_confirmed_at: null }, 'admin')).toBe(false)
      expect(canRecallSettlement({ status, guide_confirmed_at: null }, 'master_admin')).toBe(false)
    }
  })

  it('no settlement statuses are recall-eligible on admin detail', () => {
    expect(RECALL_ELIGIBLE_STATUSES).toEqual([])
  })
})

describe('assertCanRecallSettlement — friendly app-level denials', () => {
  it('denies admin + master on guide-waiting states', () => {
    for (const state of [pendingUnconfirmed, editRequested]) {
      for (const role of ['admin', 'master_admin'] as UserRole[]) {
        const res = assertCanRecallSettlement(state, role)
        expect(res.ok).toBe(false)
        if (!res.ok) expect(res.error).toBe('현재 상태에서는 회수할 수 없습니다.')
      }
    }
  })

  it('denies guide with a role message', () => {
    const res = assertCanRecallSettlement(pendingUnconfirmed, 'guide')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('회수는 관리자 권한이 필요합니다.')
  })

  it('denies paid with a paid-lock message', () => {
    const res = assertCanRecallSettlement(
      { status: 'paid', guide_confirmed_at: '2026-05-27T00:00:00Z' },
      'admin',
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('지급 완료된 정산서는 회수할 수 없습니다.')
  })

  it('denies once guide has confirmed with a finalized message', () => {
    const res = assertCanRecallSettlement(pendingConfirmed, 'admin')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('가이드가 이미 최종확인한 정산서는 회수할 수 없습니다.')
  })
})

describe('recall target status — admin-editable, not guide-actionable', () => {
  it('returns the settlement to submitted (existing admin-editable status)', () => {
    expect(RECALL_TARGET_STATUS).toBe('submitted')
    expect(canAdminEditSettlement(RECALL_TARGET_STATUS)).toBe(true)
    expect(canAdminSendForConfirmation(RECALL_TARGET_STATUS)).toBe(true)
  })

  it('a recalled (submitted) settlement is not guide-actionable', () => {
    expect(canGuideEdit({ status: RECALL_TARGET_STATUS, guide_id: 'g1' }, 'g1')).toBe(false)
    expect(
      canGuideConfirm(
        { status: RECALL_TARGET_STATUS, guide_id: 'g1', guide_confirmed_at: null },
        'g1',
      ),
    ).toBe(false)
  })

  it('a recalled settlement drops out of every guide dashboard actionable section', () => {
    // Mirrors src/app/guide/page.tsx grouping.
    const recalled = {
      status: RECALL_TARGET_STATUS,
      guide_confirmed_at: null as string | null,
    }
    const isDraftSection = recalled.status === 'draft'
    const isEditRequestedSection = (recalled.status as SettlementStatus) === 'edit_requested'
    const isPendingConfirmSection =
      (recalled.status as SettlementStatus) === 'pending_guide_confirmation' &&
      recalled.guide_confirmed_at == null
    expect(isDraftSection || isEditRequestedSection || isPendingConfirmSection).toBe(false)
  })
})

describe('recall is region-scoped for admin, cross-region for master', () => {
  it.each(MTOUR_REGION_CODES)(
    '[%s] region-scoped admin recall gate still applies when action is invoked',
    (region) => {
      const other = MTOUR_REGION_CODES.find((c) => c !== region) as string
      const adminHere = { role: 'admin' as const, assignedRegionId: region as string }

      expect(canRecallSettlement(pendingUnconfirmed, 'admin')).toBe(false)
      expect(assertAdminCanAccessSettlementBranch(adminHere, region).ok).toBe(true)
      expect(assertAdminCanAccessSettlementBranch(adminHere, other).ok).toBe(false)
    },
  )

  it.each(MTOUR_REGION_CODES)('[%s] master_admin region access unchanged (recall still disabled)', (region) => {
    const master = { role: 'master_admin' as const, assignedRegionId: null }
    expect(canRecallSettlement(editRequested, 'master_admin')).toBe(false)
    expect(assertAdminCanAccessSettlementBranch(master, region).ok).toBe(true)
  })

  it('guide is never granted recall in any region', () => {
    for (const role of ['guide'] as UserRole[]) {
      expect(canRecallSettlement(pendingUnconfirmed, role)).toBe(false)
    }
  })
})

describe('recallSettlement server action is status-only (no calc/payout/paid changes)', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/actions/settlementActions.ts'),
    'utf8',
  )
  const start = source.indexOf('export async function recallSettlement')
  const after = source.indexOf('export async function', start + 1)
  const body = source.slice(start, after === -1 ? undefined : after)

  it('exists and is guarded by region + recall guards', () => {
    expect(start).toBeGreaterThan(-1)
    expect(body).toContain('requireAdminSettlementRegionAccess')
    expect(body).toContain('assertCanRecallSettlement')
  })

  it('updates only status + reviewed_by (status-only transition)', () => {
    expect(body).toContain('.update({ status: RECALL_TARGET_STATUS, reviewed_by: profile.id })')
  })

  it('verifies exactly one row changed via optimistic status match', () => {
    expect(body).toContain(".eq('status', fromStatus)")
    expect(body).toContain('.select(\'id\')')
    expect(body).toContain('assertSingleOptimisticUpdate(updatedRows)')
  })

  it('never writes paid_at, guide confirmation flags, calc summary, or admin_note', () => {
    // Guarantees calculations, payout, company profit, paid-lock, and admin notes
    // are untouched by recall (admin_note is preserved, not overwritten).
    const update = body.slice(body.indexOf('.update('), body.indexOf('.eq('))
    expect(update).not.toContain('paid_at')
    expect(update).not.toContain('guide_confirmed_at')
    expect(update).not.toContain('calc_summary')
    expect(update).not.toContain('admin_note')
  })

  it('records the recall in the existing audit log without a new audit action value', () => {
    expect(body).toContain("action: 'status_change'")
    expect(body).toContain('admin_recall')
  })
})
