import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ACTION_NEEDED_STATUSES,
  ADMIN_DASHBOARD_STATUS_ORDER,
  ADMIN_DASHBOARD_PAID_HISTORY_LABEL,
  ADMIN_DASHBOARD_PROGRESS_ALL_LABEL,
  ADMIN_SETTLEMENT_DATE_ORDER_ERROR,
  ADMIN_SETTLEMENT_DATE_RANGE_MAX_ERROR,
  ADMIN_SETTLEMENT_EMPTY_STATUS_MESSAGE,
  ADMIN_SETTLEMENT_LIST_DB_PAGINATION_DEFERRED_REASONS,
  ADMIN_SETTLEMENT_NO_STATUS_SUBTITLE,
  actionNeededStatusPriority,
  aggregateSettlementStatusCounts,
  buildAdminDashboardListSubtitle,
  buildAdminSettlementSearchSubtitle,
  buildAdminSettlementListSubtitle,
  countActionNeededFromRows,
  countActionNeededFromStats,
  defaultAdminSettlementDateRange,
  expandAdminDashboardProgressStatuses,
  expandWorkflowStatusFilter,
  filterAdminSettlementRowsForList,
  isAdminDashboardProgressStatus,
  adminSettlementSearchHasMatches,
  buildAdminSettlementGuideSearchOr,
  buildAdminSettlementSearchIlikePattern,
  buildAdminSettlementSearchOrFilter,
  buildAdminSettlementTourSearchOr,
  matchesAdminSettlementSearch,
  paginateSortedAdminSettlementRows,
  resolveAdminSettlementListMode,
  shouldFetchAdminSettlementRows,
  sortAdminSettlementsByTourDate,
  sortActionNeededSettlements,
  validateAdminSettlementDateRange,
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

const listRows = [
  {
    id: 'late-submitted',
    status: 'submitted',
    branch_id: 'danang',
    tour: { start_date: '2026-06-20', tour_code: 'B-200', pattern: 'Ba Na Hills' },
    guide: {
      full_name: 'Alice Guide',
      korean_name: '앨리스',
      vietnamese_name: 'An',
      email: 'alice@example.com',
    },
  },
  {
    id: 'early-draft',
    status: 'draft',
    branch_id: 'danang',
    tour: { start_date: '2026-06-01', tour_code: 'A-100', pattern: 'Hoi An Morning' },
    guide: {
      full_name: 'Bob Guide',
      korean_name: '밥',
      vietnamese_name: 'Binh',
      email: 'bob@example.com',
    },
  },
  {
    id: 'same-date-paid',
    status: 'paid',
    branch_id: 'hanoi',
    tour: { start_date: '2026-06-10', tour_code: 'C-300', pattern: 'Hanoi Food' },
    guide: {
      full_name: 'Carol Guide',
      korean_name: '캐롤',
      vietnamese_name: 'Chi',
      email: 'carol@example.com',
    },
  },
  {
    id: 'same-date-edit',
    status: 'edit_requested',
    branch_id: 'danang',
    tour: { start_date: '2026-06-10', tour_code: 'A-050', pattern: 'Marble Mountain' },
    guide: {
      full_name: 'Daisy Guide',
      korean_name: '데이지',
      vietnamese_name: 'Dung',
      email: 'daisy@example.com',
    },
  },
  {
    id: 'out-of-range',
    status: 'pending_guide_confirmation',
    branch_id: 'danang',
    tour: { start_date: '2026-07-01', tour_code: 'Z-900', pattern: 'July Tour' },
    guide: {
      full_name: 'Evan Guide',
      korean_name: '에반',
      vietnamese_name: 'Em',
      email: 'evan@example.com',
    },
  },
]

describe('/admin/settlements search list behavior', () => {
  it('defaults to recent 7 days and 전체 상태 subtitle', () => {
    const range = defaultAdminSettlementDateRange(new Date(Date.UTC(2026, 5, 8)))
    expect(range).toEqual({ startDate: '2026-06-01', endDate: '2026-06-08' })
    expect(
      buildAdminSettlementSearchSubtitle({
        ...range,
        regionLabel: '전체 지역',
        statusLabel: '전체 상태',
      }),
    ).toBe('2026-06-01 ~ 2026-06-08 · 전체 지역 · 전체 상태')
  })

  it('validates date range order and max one-year range', () => {
    expect(
      validateAdminSettlementDateRange({
        startDate: '2026-06-30',
        endDate: '2026-06-01',
      }),
    ).toEqual({ ok: false, message: ADMIN_SETTLEMENT_DATE_ORDER_ERROR })
    expect(
      validateAdminSettlementDateRange({
        startDate: '2026-01-01',
        endDate: '2027-01-01',
      }),
    ).toEqual({ ok: false, message: ADMIN_SETTLEMENT_DATE_RANGE_MAX_ERROR })
    expect(
      validateAdminSettlementDateRange({
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      }),
    ).toEqual({ ok: true })
  })

  it('date range filters by tour.start_date and 전체 includes all statuses', () => {
    const filtered = filterAdminSettlementRowsForList(listRows, {
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    })

    expect(filtered.map((r) => r.id)).toEqual([
      'early-draft',
      'same-date-edit',
      'same-date-paid',
      'late-submitted',
    ])
    expect(filtered.map((r) => r.status)).toEqual([
      'draft',
      'edit_requested',
      'paid',
      'submitted',
    ])
  })

  it('status-specific filtering still works', () => {
    const filtered = filterAdminSettlementRowsForList(listRows, {
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      status: 'submitted',
    })

    expect(filtered.map((r) => r.id)).toEqual(['late-submitted'])
  })

  it('search matches tour name/pattern', () => {
    expect(matchesAdminSettlementSearch(listRows[0], 'ba na')).toBe(true)
    expect(matchesAdminSettlementSearch(listRows[0], 'missing')).toBe(false)
  })

  it('search matches tour code', () => {
    expect(matchesAdminSettlementSearch(listRows[1], 'A-100')).toBe(true)
    expect(matchesAdminSettlementSearch(listRows[1], 'Z-999')).toBe(false)
  })

  it('search matches guide name', () => {
    expect(matchesAdminSettlementSearch(listRows[2], 'Carol')).toBe(true)
    expect(matchesAdminSettlementSearch(listRows[2], 'nobody')).toBe(false)
  })

  it('search matches guide email', () => {
    expect(matchesAdminSettlementSearch(listRows[3], 'daisy@example.com')).toBe(true)
    expect(matchesAdminSettlementSearch(listRows[3], 'other@example.com')).toBe(false)
  })

  it('region + date range + status + search work together', () => {
    const filtered = filterAdminSettlementRowsForList(listRows, {
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      regionId: 'danang',
      status: 'edit_requested',
      search: 'marble',
    })

    expect(filtered.map((r) => r.id)).toEqual(['same-date-edit'])
  })
})

describe('main admin dashboard settlement list behavior', () => {
  it('shows only active work-status cards and excludes 지급완료 from main cards', () => {
    expect(ADMIN_DASHBOARD_STATUS_ORDER).toEqual([
      'draft',
      'submitted',
      'edit_requested',
      'pending_guide_confirmation',
    ])
    expect(ADMIN_DASHBOARD_STATUS_ORDER).not.toContain('paid')
  })

  it('does not render settlement rows by default and shows region-aware empty subtitle', () => {
    expect(resolveAdminSettlementListMode({})).toBe('none')
    expect(shouldFetchAdminSettlementRows({})).toBe(false)
    expect(buildAdminDashboardListSubtitle({ regionLabel: '전체 지역' })).toBe(
      '전체 지역 · 상태 미선택',
    )
    expect(ADMIN_SETTLEMENT_EMPTY_STATUS_MESSAGE).toBe(
      '상태 카드를 선택하면 해당 정산서가 표시됩니다.',
    )
  })

  it('clicking active status cards enables status-scoped dashboard rows', () => {
    for (const [status, label] of [
      ['draft', '미제출'],
      ['submitted', '제출됨'],
      ['edit_requested', '수정요청'],
      ['pending_guide_confirmation', '최종확인'],
    ] as const) {
      expect(shouldFetchAdminSettlementRows({ status })).toBe(true)
      expect(
        buildAdminDashboardListSubtitle({
          regionLabel: '전체 지역',
          statusLabel: label,
        }),
      ).toBe(`전체 지역 · ${label}`)
    }
  })

  it('keeps region-only dashboard filtering empty until status or 전체 보기 is selected', () => {
    expect(shouldFetchAdminSettlementRows({})).toBe(false)
    expect(shouldFetchAdminSettlementRows({ status: 'submitted' })).toBe(true)
    expect(shouldFetchAdminSettlementRows({ view: 'all' })).toBe(true)
    expect(
      buildAdminDashboardListSubtitle({ regionLabel: '다낭', view: 'all' }),
    ).toBe('다낭 · 진행 전체 보기')
  })

  it('uses dashboard-level action labels and keeps paid out of progress rows', () => {
    expect(ADMIN_DASHBOARD_PROGRESS_ALL_LABEL).toBe('진행 전체 보기')
    expect(ADMIN_DASHBOARD_PAID_HISTORY_LABEL).toBe('지급완료 내역')
    expect(isAdminDashboardProgressStatus('draft')).toBe(true)
    expect(isAdminDashboardProgressStatus('submitted')).toBe(true)
    expect(isAdminDashboardProgressStatus('edit_requested')).toBe(true)
    expect(isAdminDashboardProgressStatus('pending_guide_confirmation')).toBe(true)
    expect(isAdminDashboardProgressStatus('paid')).toBe(false)
    expect(isAdminDashboardProgressStatus('approved')).toBe(true)
    expect(isAdminDashboardProgressStatus('recalled')).toBe(false)
  })

  it('expands dashboard progress statuses to include legacy DB values', () => {
    expect(expandAdminDashboardProgressStatuses()).toEqual(
      expect.arrayContaining([
        'draft',
        'submitted',
        'edit_requested',
        'rejected',
        'clarification_requested',
        'pending_guide_confirmation',
        'approved',
      ]),
    )
    expect(expandAdminDashboardProgressStatuses()).toHaveLength(7)
    expect(expandAdminDashboardProgressStatuses()).not.toContain('paid')
    expect(expandAdminDashboardProgressStatuses()).not.toContain('recalled')
  })

  it('filters dashboard view=all progress statuses before pagination, not after slice', () => {
    const progressRows = Array.from({ length: 30 }, (_, i) => ({
      id: `progress-${i}`,
      status: 'draft',
      tour: {
        start_date: `2026-06-${String(i + 1).padStart(2, '0')}`,
        tour_code: `P-${i}`,
      },
    }))
    const paidRows = Array.from({ length: 30 }, (_, i) => ({
      id: `paid-${i}`,
      status: 'paid',
      tour: {
        start_date: `2026-05-${String(i + 1).padStart(2, '0')}`,
        tour_code: `X-${i}`,
      },
    }))
    const allRows = [...progressRows, ...paidRows]
    const pageSize = 25

    const progressOnly = allRows.filter((row) => isAdminDashboardProgressStatus(row.status))
    const sortedProgress = sortAdminSettlementsByTourDate(progressOnly)
    const page1FilteredFirst = sortedProgress.slice(0, pageSize)

    const sortedAll = sortAdminSettlementsByTourDate(allRows)
    const page1SliceThenFilter = sortedAll
      .slice(0, pageSize)
      .filter((row) => isAdminDashboardProgressStatus(row.status))

    expect(progressOnly).toHaveLength(30)
    expect(page1FilteredFirst).toHaveLength(25)
    expect(page1SliceThenFilter.length).toBeLessThan(25)
  })

  it('passes dashboardProgressOnly to getAdminSettlements for view=all', () => {
    const source = readFileSync('src/app/admin/page.tsx', 'utf8')

    expect(source).toContain('dashboardProgressOnly: view === \'all\' ? true : undefined')
    expect(source).not.toContain('isAdminDashboardProgressStatus')
    expect(source).not.toContain('settlements.items.filter')
  })

  it('places dashboard view actions in the status header, not the list header', () => {
    const source = readFileSync('src/app/admin/page.tsx', 'utf8')
    const statusHeader = source.indexOf('상태별 정산서')
    const listHeader = source.indexOf('정산서 목록')
    const progressAction = source.indexOf('ADMIN_DASHBOARD_PROGRESS_ALL_LABEL', statusHeader)
    const paidAction = source.indexOf('ADMIN_DASHBOARD_PAID_HISTORY_LABEL', statusHeader)

    expect(statusHeader).toBeGreaterThan(-1)
    expect(listHeader).toBeGreaterThan(statusHeader)
    expect(progressAction).toBeGreaterThan(statusHeader)
    expect(progressAction).toBeLessThan(listHeader)
    expect(paidAction).toBeGreaterThan(statusHeader)
    expect(paidAction).toBeLessThan(listHeader)
    expect(source.slice(listHeader)).not.toContain('ADMIN_DASHBOARD_PROGRESS_ALL_LABEL')
    expect(source.slice(listHeader)).not.toContain('ADMIN_DASHBOARD_PAID_HISTORY_LABEL')
  })

  it('admin screens provide route loading UI and dev-only timing labels', () => {
    const dashboard = readFileSync('src/app/admin/page.tsx', 'utf8')
    const list = readFileSync('src/app/admin/settlements/page.tsx', 'utf8')
    const dashboardLoading = readFileSync('src/app/admin/loading.tsx', 'utf8')
    const listLoading = readFileSync('src/app/admin/settlements/loading.tsx', 'utf8')

    expect(dashboard).toContain("timed('admin dashboard settlement status counts'")
    expect(dashboard).toContain("timed('admin dashboard settlement list'")
    expect(list).toContain("timed('admin settlement list rows'")
    expect(dashboardLoading).toContain('관리자 대시보드 불러오는 중')
    expect(listLoading).toContain('정산서 목록 불러오는 중')
  })
})

describe('admin settlement search helpers', () => {
  it('builds tour and guide ILIKE or filters from escaped pattern', () => {
    const pattern = buildAdminSettlementSearchIlikePattern('APR26%')
    expect(pattern).toBe('%APR26\\%%')
    expect(buildAdminSettlementTourSearchOr(pattern)).toBe(
      'pattern.ilike.%APR26\\%%,tour_code.ilike.%APR26\\%%',
    )
    expect(buildAdminSettlementGuideSearchOr(pattern)).toContain('full_name.ilike.%APR26\\%%')
    expect(buildAdminSettlementGuideSearchOr(pattern)).toContain('email.ilike.%APR26\\%%')
  })

  it('buildAdminSettlementSearchOrFilter uses id.in for tours and tour_id.in for settlements', () => {
    const scope = { tourIds: ['tour-1', 'tour-2'], guideIds: ['guide-1'] }
    expect(buildAdminSettlementSearchOrFilter(scope, 'tours')).toBe(
      'id.in.(tour-1,tour-2),guide_id.in.(guide-1)',
    )
    expect(buildAdminSettlementSearchOrFilter(scope, 'settlements')).toBe(
      'tour_id.in.(tour-1,tour-2),guide_id.in.(guide-1)',
    )
    expect(adminSettlementSearchHasMatches({ tourIds: [], guideIds: [] })).toBe(false)
    expect(buildAdminSettlementSearchOrFilter({ tourIds: [], guideIds: [] }, 'tours')).toBeNull()
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

describe('paginateSortedAdminSettlementRows', () => {
  const rows = [
    { id: 'row-1', tour: { start_date: '2026-06-01', tour_code: 'A-001' } },
    { id: 'row-2', tour: { start_date: '2026-06-02', tour_code: 'B-001' } },
    { id: 'row-3', tour: { start_date: '2026-06-03', tour_code: 'C-001' } },
    { id: 'row-4', tour: { start_date: '2026-06-04', tour_code: 'D-001' } },
    { id: 'row-5', tour: { start_date: '2026-06-05', tour_code: 'E-001' } },
  ]

  it('returns page 1 and page 2 in tour-date order with correct totals', () => {
    const page1 = paginateSortedAdminSettlementRows(rows, { page: 1, pageSize: 2 })
    const page2 = paginateSortedAdminSettlementRows(rows, { page: 2, pageSize: 2 })

    expect(page1.items.map((r) => r.id)).toEqual(['row-1', 'row-2'])
    expect(page2.items.map((r) => r.id)).toEqual(['row-3', 'row-4'])
    expect(page1.total).toBe(5)
    expect(page2.total).toBe(5)
    expect(page1.totalPages).toBe(3)
    expect(page2.page).toBe(2)
  })

  it('uses explicit total when provided (DB count path)', () => {
    const page = paginateSortedAdminSettlementRows(rows, {
      page: 1,
      pageSize: 2,
      total: 99,
    })

    expect(page.items).toHaveLength(2)
    expect(page.total).toBe(99)
    expect(page.totalPages).toBe(50)
  })

  it('composes with search/date/status-filtered rows without changing order', () => {
    const filtered = filterAdminSettlementRowsForList(listRows, {
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      status: 'submitted',
    })
    const page = paginateSortedAdminSettlementRows(filtered, { page: 1, pageSize: 10 })

    expect(page.items.map((r) => r.id)).toEqual(['late-submitted'])
    expect(page.total).toBe(1)
  })
})

describe('admin settlement list DB pagination deferral', () => {
  it('documents why DB .range() is not applied yet', () => {
    expect(ADMIN_SETTLEMENT_LIST_DB_PAGINATION_DEFERRED_REASONS).toContain(
      'ordering requires tours.start_date via embed order',
    )
    expect(ADMIN_SETTLEMENT_LIST_DB_PAGINATION_DEFERRED_REASONS).toContain(
      '미제출 path merges synthetic rows in memory',
    )
    expect(ADMIN_SETTLEMENT_LIST_DB_PAGINATION_DEFERRED_REASONS).toContain(
      'date filter uses large tour_id IN lists',
    )
  })
})
