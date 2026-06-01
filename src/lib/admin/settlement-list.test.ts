import { describe, expect, it } from 'vitest'
import {
  ACTION_NEEDED_STATUSES,
  actionNeededStatusPriority,
  sortActionNeededSettlements,
} from './settlement-list'

describe('ACTION_NEEDED_STATUSES', () => {
  it('includes admin action-needed statuses only', () => {
    expect(ACTION_NEEDED_STATUSES).toEqual([
      'clarification_requested',
      'pending_guide_confirmation',
      'submitted',
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
    expect(sorted.map((r) => r.id)).toEqual(['2', '3', '1'])
  })

  it('does not filter by year_month (global queue)', () => {
    const rows = [
      { id: 'a', status: 'submitted', updated_at: '2026-05-01T00:00:00Z' },
      { id: 'b', status: 'submitted', updated_at: '2026-04-01T00:00:00Z' },
    ]
    expect(sortActionNeededSettlements(rows)).toHaveLength(2)
    expect(actionNeededStatusPriority('submitted')).toBe(2)
  })
})
