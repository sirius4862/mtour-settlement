import { describe, expect, it } from 'vitest'
import {
  ACTION_NEEDED_STATUSES,
  ADMIN_SETTLEMENT_EMPTY_STATUS_MESSAGE,
  ADMIN_SETTLEMENT_NO_STATUS_SUBTITLE,
  actionNeededStatusPriority,
  aggregateSettlementStatusCounts,
  buildAdminSettlementListSubtitle,
  countActionNeededFromRows,
  countActionNeededFromStats,
  expandWorkflowStatusFilter,
  resolveAdminSettlementListMode,
  shouldFetchAdminSettlementRows,
  sortAdminSettlementsByTourDate,
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

describe('admin settlement list dashboard behavior', () => {
  it('does not fetch or render settlement rows by default', () => {
    expect(resolveAdminSettlementListMode({})).toBe('none')
    expect(shouldFetchAdminSettlementRows({})).toBe(false)
    expect(ADMIN_SETTLEMENT_EMPTY_STATUS_MESSAGE).toBe(
      '상태 카드를 선택하면 해당 정산서가 표시됩니다.',
    )
    expect(ADMIN_SETTLEMENT_NO_STATUS_SUBTITLE).toBe('상태 미선택')
  })

  it('fetches rows only after a status card is selected', () => {
    for (const status of [
      'draft',
      'submitted',
      'edit_requested',
      'pending_guide_confirmation',
    ]) {
      expect(resolveAdminSettlementListMode({ status })).toBe('status')
      expect(shouldFetchAdminSettlementRows({ status })).toBe(true)
    }
  })

  it('supports explicit full list only after 전체 보기 is clicked', () => {
    expect(resolveAdminSettlementListMode({ view: 'all' })).toBe('all')
    expect(shouldFetchAdminSettlementRows({ view: 'all' })).toBe(true)
  })

  it('keeps region-only filtering empty until a status or 전체 보기 is selected', () => {
    expect(shouldFetchAdminSettlementRows({})).toBe(false)
    expect(shouldFetchAdminSettlementRows({ status: 'submitted' })).toBe(true)
    expect(shouldFetchAdminSettlementRows({ view: 'all' })).toBe(true)
  })

  it('builds the list subtitle for default, status, and 전체 보기 states', () => {
    expect(buildAdminSettlementListSubtitle({ regionLabel: '전체 지역' })).toBe('상태 미선택')
    expect(
      buildAdminSettlementListSubtitle({
        regionLabel: '전체 지역',
        statusLabel: '미제출',
      }),
    ).toBe('전체 지역 · 미제출')
    expect(
      buildAdminSettlementListSubtitle({
        regionLabel: '전체 지역',
        statusLabel: '제출됨',
      }),
    ).toBe('전체 지역 · 제출됨')
    expect(
      buildAdminSettlementListSubtitle({
        regionLabel: '전체 지역',
        statusLabel: '수정요청',
      }),
    ).toBe('전체 지역 · 수정요청')
    expect(
      buildAdminSettlementListSubtitle({
        regionLabel: '전체 지역',
        statusLabel: '최종확인',
      }),
    ).toBe('전체 지역 · 최종확인')
    expect(buildAdminSettlementListSubtitle({ regionLabel: '전체 지역', view: 'all' })).toBe(
      '전체 지역 · 전체 보기',
    )
  })
})

describe('sortAdminSettlementsByTourDate', () => {
  it('sorts displayed rows by tour date ascending, then tour code ascending', () => {
    const rows = [
      { id: 'late', tour: { start_date: '2026-06-20', tour_code: 'B-001' } },
      { id: 'same-b', tour: { start_date: '2026-06-10', tour_code: 'B-002' } },
      { id: 'same-a', tour: { start_date: '2026-06-10', tour_code: 'A-001' } },
      { id: 'oldest', tour: { start_date: '2026-05-01', tour_code: 'C-001' } },
    ]

    const sorted = sortAdminSettlementsByTourDate(rows)

    expect(sorted.map((r) => r.id)).toEqual(['oldest', 'same-a', 'same-b', 'late'])
  })
})
