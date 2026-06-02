import { describe, expect, it } from 'vitest'
import {
  ACTION_NEEDED_STATUSES,
  actionNeededStatusPriority,
  aggregateSettlementStatusCounts,
  countActionNeededFromRows,
  countActionNeededFromStats,
  expandWorkflowStatusFilter,
  sortActionNeededSettlements,
} from './settlement-list'

describe('ACTION_NEEDED_STATUSES', () => {
  it('includes admin action-needed statuses only', () => {
    expect(ACTION_NEEDED_STATUSES).toEqual([
      'submitted',
      'clarification_requested',
      'pending_guide_confirmation',
      'approved',
    ])
  })

  it('does not include edit_requested (guide-side rework, not admin queue)', () => {
    expect(ACTION_NEEDED_STATUSES).not.toContain('edit_requested')
  })
})

describe('sortActionNeededSettlements', () => {
  it('sorts by status priority then updated_at desc', () => {
    const rows = [
      { id: '1', status: 'submitted', updated_at: '2026-05-01T00:00:00Z' },
      { id: '2', status: 'clarification_requested', updated_at: '2026-04-01T00:00:00Z' },
      { id: '3', status: 'pending_guide_confirmation', updated_at: '2026-06-01T00:00:00Z' },
    ]
    const sorted = sortActionNeededSettlements(rows)
    expect(sorted.map((r) => r.id)).toEqual(['1', '2', '3'])
  })
})

describe('aggregateSettlementStatusCounts', () => {
  it('counts five workflow statuses with legacy normalization', () => {
    const rows = [
      { status: 'submitted' },
      { status: 'submitted' },
      { status: 'submitted' },
      { status: 'submitted' },
      { status: 'clarification_requested' },
      { status: 'pending_guide_confirmation' },
      { status: 'approved' },
    ]
    const stats = aggregateSettlementStatusCounts(rows)
    expect(stats.find((s) => s.status === 'submitted')?.count).toBe(4)
    expect(stats.find((s) => s.status === 'edit_requested')?.count).toBe(1)
    expect(stats.find((s) => s.status === 'pending_guide_confirmation')?.count).toBe(2)
    expect(stats.find((s) => s.status === 'approved')).toBeUndefined()
    expect(stats.find((s) => s.status === 'draft')?.count).toBe(0)
  })

  it('matches action-needed totals between stats and queue rows', () => {
    const rows = [
      { status: 'submitted' },
      { status: 'submitted' },
      { status: 'clarification_requested' },
      { status: 'pending_guide_confirmation' },
      { status: 'approved' },
    ]
    const stats = aggregateSettlementStatusCounts(rows)
    expect(countActionNeededFromStats(stats)).toBe(countActionNeededFromRows(rows))
    expect(countActionNeededFromStats(stats)).toBe(4)
  })

  it('action-needed card counts align with queue scope (cross-month submitted)', () => {
    const rows = [
      { status: 'submitted', year_month: '2025-11' },
      { status: 'submitted', year_month: '2025-11' },
      { status: 'submitted', year_month: '2026-05' },
      { status: 'submitted', year_month: '2026-05' },
    ]
    const stats = aggregateSettlementStatusCounts(rows)
    expect(stats.find((s) => s.status === 'submitted')?.count).toBe(4)
    expect(countActionNeededFromStats(stats)).toBe(4)
    expect(actionNeededStatusPriority('submitted')).toBe(0)
  })
})

describe('expandWorkflowStatusFilter', () => {
  it('includes legacy statuses for pre-migration list filters', () => {
    expect(expandWorkflowStatusFilter('submitted')).toEqual(['submitted'])
    expect(expandWorkflowStatusFilter('pending_guide_confirmation')).toEqual([
      'pending_guide_confirmation',
      'approved',
    ])
    expect(expandWorkflowStatusFilter('edit_requested')).toEqual([
      'edit_requested',
      'rejected',
      'clarification_requested',
    ])
    expect(expandWorkflowStatusFilter('draft')).toEqual(['draft'])
    expect(expandWorkflowStatusFilter('paid')).toEqual(['paid'])
  })
})
