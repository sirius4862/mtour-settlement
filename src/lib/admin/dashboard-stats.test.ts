import { describe, expect, it } from 'vitest'
import type { SettlementStatus } from '@/types'
import {
  aggregateSettlementStatusCounts,
  aggregateSettlementStatusCountsFromBuckets,
  applyDashboardDraftCountOverride,
  expandWorkflowStatusFilter,
  paginateSortedAdminSettlementRows,
} from './settlement-list'
import {
  computeAdminUnsubmittedTotal,
  computeAdminUnsubmittedTotalFromRows,
  countAdminUnsubmittedWithoutSearch,
  mergeAdminUnsubmittedListItems,
} from './settlement-unsubmitted-list'

function buildDashboardStatsFromLegacyPaths(
  statusRows: { status: string }[],
  tours: Parameters<typeof mergeAdminUnsubmittedListItems>[0],
  settlements: Parameters<typeof mergeAdminUnsubmittedListItems>[1],
): { status: SettlementStatus; count: number }[] {
  const stats = aggregateSettlementStatusCounts(statusRows)
  const unsubmittedTotal = paginateSortedAdminSettlementRows(
    mergeAdminUnsubmittedListItems(tours, settlements),
    { page: 1, pageSize: 1 },
  ).total
  return applyDashboardDraftCountOverride(stats, unsubmittedTotal)
}

function buildDashboardStatsFromOptimizedPaths(
  statusRows: { status: string }[],
  tours: Parameters<typeof mergeAdminUnsubmittedListItems>[0],
  settlements: Parameters<typeof mergeAdminUnsubmittedListItems>[1],
): { status: SettlementStatus; count: number }[] {
  const buckets = aggregateSettlementStatusCountsFromBuckets(
    (['draft', 'submitted', 'pending_guide_confirmation', 'edit_requested', 'paid'] as const).map(
      (workflowStatus) => {
        const dbStatuses = expandWorkflowStatusFilter(workflowStatus) as readonly string[]
        const count = statusRows.filter((row) => dbStatuses.includes(row.status)).length
        return { status: workflowStatus, count }
      },
    ),
  )
  const unsubmittedTotal = computeAdminUnsubmittedTotalFromRows(tours, settlements)
  return applyDashboardDraftCountOverride(buckets, unsubmittedTotal)
}

const tourBase = {
  pattern: 'Tour',
  tour_code: 'T-01',
  start_date: '2026-04-15',
  pax_count: 10,
  branch_id: 'danang',
  guide_id: 'guide-1',
  assignment_status: 'assigned',
  created_at: '2026-04-01T00:00:00Z',
  guide: {
    id: 'guide-1',
    full_name: 'Kim Guide',
    email: 'kim@example.com',
    korean_name: '김가이드',
    vietnamese_name: null,
  },
  branch: { id: 'danang', name: 'Da Nang', code: 'DANANG' },
}

describe('dashboard stats golden parity', () => {
  it('matches legacy dashboard stats object byte-for-byte on seeded fixture', () => {
    const tours = [
      { ...tourBase, id: 'tour-no-settlement' },
      { ...tourBase, id: 'tour-draft', tour_code: 'T-02' },
      { ...tourBase, id: 'tour-submitted', tour_code: 'T-03' },
    ]
    const settlements = [
      {
        id: 'settlement-draft',
        status: 'draft' as const,
        year_month: '2026-04',
        updated_at: '2026-04-10T00:00:00Z',
        submitted_at: null,
        guide_confirmed_at: null,
        branch_id: 'danang',
        calc_summary_json: null,
        tour: {
          id: 'tour-draft',
          pattern: 'Tour',
          tour_code: 'T-02',
          start_date: '2026-04-15',
          pax_count: 10,
        },
        guide: tourBase.guide,
        branch: tourBase.branch,
      },
      {
        id: 'settlement-submitted',
        status: 'submitted' as const,
        year_month: '2026-04',
        updated_at: '2026-04-11T00:00:00Z',
        submitted_at: '2026-04-11T00:00:00Z',
        guide_confirmed_at: null,
        branch_id: 'danang',
        calc_summary_json: null,
        tour: {
          id: 'tour-submitted',
          pattern: 'Tour',
          tour_code: 'T-03',
          start_date: '2026-04-15',
          pax_count: 10,
        },
        guide: tourBase.guide,
        branch: tourBase.branch,
      },
      {
        id: 'settlement-legacy',
        status: 'clarification_requested' as const,
        year_month: '2026-04',
        updated_at: '2026-04-12T00:00:00Z',
        submitted_at: '2026-04-12T00:00:00Z',
        guide_confirmed_at: null,
        branch_id: 'danang',
        calc_summary_json: null,
        tour: {
          id: 'tour-legacy',
          pattern: 'Tour',
          tour_code: 'T-04',
          start_date: '2026-04-16',
          pax_count: 10,
        },
        guide: tourBase.guide,
        branch: tourBase.branch,
      },
    ]
    const statusRows = settlements.map((row) => ({ status: row.status }))

    const legacy = buildDashboardStatsFromLegacyPaths(statusRows, tours, settlements)
    const optimized = buildDashboardStatsFromOptimizedPaths(statusRows, tours, settlements)

    expect(JSON.stringify(optimized)).toBe(JSON.stringify(legacy))
  })
})

describe('dashboard status bucket parity', () => {
  it('matches Node aggregation for legacy and unknown statuses', () => {
    const rows = [
      { status: 'draft' },
      { status: 'submitted' },
      { status: 'clarification_requested' },
      { status: 'approved' },
      { status: 'paid' },
      { status: 'legacy_unknown_status' },
      { status: 'rejected' },
    ]

    const legacy = aggregateSettlementStatusCounts(rows)
    const buckets = aggregateSettlementStatusCountsFromBuckets(
      (['draft', 'submitted', 'pending_guide_confirmation', 'edit_requested', 'paid'] as const).map(
        (workflowStatus) => ({
          status: workflowStatus,
          count: rows.filter((row) =>
            (expandWorkflowStatusFilter(workflowStatus) as readonly string[]).includes(row.status),
          ).length,
        }),
      ),
    )

    expect(buckets).toEqual(legacy)
  })
})

describe('applyDashboardDraftCountOverride', () => {
  it('replaces only the draft card count', () => {
    const stats = [
      { status: 'draft' as const, count: 1 },
      { status: 'submitted' as const, count: 4 },
    ]
    expect(applyDashboardDraftCountOverride(stats, 9)).toEqual([
      { status: 'draft', count: 9 },
      { status: 'submitted', count: 4 },
    ])
  })
})

describe('count-only unsubmitted parity helpers', () => {
  it('fast count path matches merge total without search', () => {
    const tours = [
      { ...tourBase, id: 'tour-a' },
      { ...tourBase, id: 'tour-b', tour_code: 'T-02' },
    ]
    const settlements = [
      {
        status: 'draft',
        tour: { id: 'tour-b' },
      },
    ]
    expect(countAdminUnsubmittedWithoutSearch(tours, settlements)).toBe(2)
    expect(computeAdminUnsubmittedTotalFromRows(tours, settlements)).toBe(2)
    expect(computeAdminUnsubmittedTotal(tours, [])).toBe(2)
  })
})
