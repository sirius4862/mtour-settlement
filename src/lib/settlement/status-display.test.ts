import { describe, expect, it } from 'vitest'
import {
  aggregateSettlementStatusCounts,
  normalizeStatusForDashboard,
} from '@/lib/admin/settlement-list'
import { getSettlementStatusDisplay, WORKFLOW_STATUS_ORDER } from '@/lib/settlement/status-display'

describe('normalizeStatusForDashboard', () => {
  it('maps legacy statuses into the five-status model', () => {
    expect(normalizeStatusForDashboard('approved')).toBe('pending_guide_confirmation')
    expect(normalizeStatusForDashboard('clarification_requested')).toBe('edit_requested')
    expect(normalizeStatusForDashboard('rejected')).toBe('edit_requested')
    expect(normalizeStatusForDashboard('submitted')).toBe('submitted')
  })
})

describe('aggregateSettlementStatusCounts', () => {
  it('counts legacy approved under 최종확인', () => {
    const stats = aggregateSettlementStatusCounts([
      { status: 'approved' },
      { status: 'pending_guide_confirmation' },
      { status: 'submitted' },
    ])
    const pending = stats.find((s) => s.status === 'pending_guide_confirmation')
    const submitted = stats.find((s) => s.status === 'submitted')
    expect(pending?.count).toBe(2)
    expect(submitted?.count).toBe(1)
    expect(stats).toHaveLength(WORKFLOW_STATUS_ORDER.length)
  })
})

describe('getSettlementStatusDisplay', () => {
  it('shows 지급가능 badge on confirmed 최종확인', () => {
    const display = getSettlementStatusDisplay('pending_guide_confirmation', '2026-05-27T00:00:00Z')
    expect(display.label).toBe('최종확인')
    expect(display.payReadyBadge).toBe('지급가능')
  })

  it('maps legacy approved to 최종확인', () => {
    const display = getSettlementStatusDisplay('approved', null)
    expect(display.label).toBe('최종확인')
    expect(display.payReadyBadge).toBeUndefined()
  })

  it('maps legacy clarification_requested to 수정요청', () => {
    const display = getSettlementStatusDisplay('clarification_requested', null)
    expect(display.label).toBe('수정요청')
  })

  it('labels a recalled (배정회수) settlement', () => {
    const display = getSettlementStatusDisplay('recalled', null)
    expect(display.label).toBe('배정회수')
    expect(display.payReadyBadge).toBeUndefined()
  })
})
