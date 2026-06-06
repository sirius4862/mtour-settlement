import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SettlementStatus, UserRole } from '@/types'
import {
  assertCanRecallTourAssignment,
  isAssignmentRecallEligible,
} from './assignment-recall'

describe('isAssignmentRecallEligible', () => {
  it('allows recall when no settlement exists (정산서 미작성)', () => {
    expect(
      isAssignmentRecallEligible({
        assignmentStatus: 'assigned',
        settlementStatus: null,
        guideConfirmedAt: null,
      }),
    ).toBe(true)
  })

  it('allows recall for draft (작성중) and submitted (제출됨)', () => {
    for (const status of ['draft', 'submitted'] as SettlementStatus[]) {
      expect(
        isAssignmentRecallEligible({
          assignmentStatus: 'assigned',
          settlementStatus: status,
          guideConfirmedAt: null,
        }),
      ).toBe(true)
    }
  })

  it('blocks recall for review/confirm/pay statuses', () => {
    const blocked: SettlementStatus[] = [
      'edit_requested',
      'pending_guide_confirmation',
      'approved',
      'clarification_requested',
      'paid',
      'rejected',
    ]
    for (const status of blocked) {
      expect(
        isAssignmentRecallEligible({
          assignmentStatus: 'assigned',
          settlementStatus: status,
          guideConfirmedAt: null,
        }),
      ).toBe(false)
    }
  })

  it('blocks recall when the guide has already confirmed', () => {
    expect(
      isAssignmentRecallEligible({
        assignmentStatus: 'assigned',
        settlementStatus: 'submitted',
        guideConfirmedAt: '2026-06-05T00:00:00Z',
      }),
    ).toBe(false)
  })

  it('blocks recall for an already-recalled tour', () => {
    expect(
      isAssignmentRecallEligible({
        assignmentStatus: 'recalled',
        settlementStatus: null,
        guideConfirmedAt: null,
      }),
    ).toBe(false)
    expect(
      isAssignmentRecallEligible({
        assignmentStatus: 'recalled',
        settlementStatus: 'recalled',
        guideConfirmedAt: null,
      }),
    ).toBe(false)
  })
})

describe('assertCanRecallTourAssignment', () => {
  const base = {
    assignmentStatus: 'assigned' as const,
    settlementStatus: null,
    guideConfirmedAt: null,
  }

  it('allows admin and master_admin for eligible tours', () => {
    for (const role of ['admin', 'master_admin'] as UserRole[]) {
      expect(assertCanRecallTourAssignment({ ...base, role }).ok).toBe(true)
    }
  })

  it('blocks the guide role', () => {
    const result = assertCanRecallTourAssignment({ ...base, role: 'guide' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('관리자 권한')
  })

  it('blocks already-recalled, confirmed, and ineligible statuses', () => {
    expect(
      assertCanRecallTourAssignment({ ...base, assignmentStatus: 'recalled', role: 'admin' }).ok,
    ).toBe(false)
    expect(
      assertCanRecallTourAssignment({
        ...base,
        settlementStatus: 'submitted',
        guideConfirmedAt: '2026-06-05T00:00:00Z',
        role: 'admin',
      }).ok,
    ).toBe(false)
    expect(
      assertCanRecallTourAssignment({
        ...base,
        settlementStatus: 'pending_guide_confirmation',
        role: 'admin',
      }).ok,
    ).toBe(false)
    expect(
      assertCanRecallTourAssignment({ ...base, settlementStatus: 'paid', role: 'admin' }).ok,
    ).toBe(false)
  })
})

describe('recallTourAssignment server action source', () => {
  const source = readFileSync('src/lib/actions/tourActions.ts', 'utf8')
  const fnStart = source.indexOf('export async function recallTourAssignment')
  const fnBody = source.slice(fnStart)

  it('checks admin region access before recalling', () => {
    expect(fnBody).toContain('assertAdminCanAccessSettlementBranch')
    expect(fnBody).toContain('assertCanRecallTourAssignment')
  })

  it('only writes assignment + recall metadata on the tour, never guide_id', () => {
    expect(fnBody).toContain("assignment_status: 'recalled'")
    expect(fnBody).toContain('recalled_at: now')
    expect(fnBody).toContain('recalled_by: ctx.id')
    // No guide change is ever performed by recall (no guide_id write).
    expect(fnBody).not.toContain('guide_id:')
  })

  it('moves an existing settlement to recalled with a status-only update', () => {
    expect(fnBody).toContain("status: 'recalled'")
    // Never WRITES monetary / payout / confirmation / paid fields (object-literal form).
    expect(fnBody).not.toContain('paid_at:')
    expect(fnBody).not.toContain('guide_confirmed_at:')
    expect(fnBody).not.toContain('ground_fee_usd')
    expect(fnBody).not.toContain('guide_daily_fee_usd')
  })
})

describe('guide-side recall exclusion source', () => {
  const actions = readFileSync('src/lib/actions/settlementActions.ts', 'utf8')

  it('hides recalled tours from the guide assigned-tours query', () => {
    expect(actions).toContain(".neq('assignment_status', 'recalled')")
  })

  it('blocks creating a settlement from a recalled tour', () => {
    expect(actions).toContain("tour.assignment_status === 'recalled'")
  })

  it('guide read view migration excludes recalled settlements and recalled tours', () => {
    const sql = readFileSync('supabase/assignment_recall_v1_migration.sql', 'utf8')
    expect(sql).toContain("s.status <> 'recalled'::public.settlement_status")
    expect(sql).toContain("t.assignment_status = 'recalled'")
  })
})
