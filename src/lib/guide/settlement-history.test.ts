import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SettlementWithTour } from '@/types'
import { GUIDE_DASHBOARD_SETTLEMENT_SELECT } from './dashboard-settlements'
import {
  GUIDE_HISTORY_EMPTY_MESSAGE,
  GUIDE_HISTORY_PERIOD_HELPER,
  GUIDE_SETTLEMENT_HISTORY_SELECT,
  buildGuideHistoryUrl,
  expandGuideHistoryStatusFilter,
  guideHistoryRecent30Days,
  guideHistoryRecent7Days,
  matchesGuideHistoryFilters,
  normalizeGuideHistoryPage,
  parseGuideHistoryPeriod,
  parseGuideHistoryStatus,
  resolveGuideHistoryDateRange,
  tourStartDateInGuideHistoryRange,
} from './settlement-history'

const ROOT = process.cwd()

function settlement(overrides: Partial<SettlementWithTour>): SettlementWithTour {
  return {
    id: 'settlement-1',
    tour_id: 'tour-1',
    guide_id: 'guide-1',
    branch_id: 'branch-1',
    status: 'submitted',
    year_month: '2026-05',
    exchange_rate: 1,
    advance_vnd: 0,
    tour_fee_usd: 0,
    ground_fee_usd: 0,
    charming_other_usd: 0,
    tip_received_usd: 0,
    option_receivable_usd: 0,
    tip_transfer_usd: 0,
    option_credit_usd: 0,
    vehicle_fee_usd: 0,
    head_tax_usd: 0,
    seoul_biz_fee_usd: 0,
    tc_guide_usd: 0,
    tc_company_usd: 0,
    megugi_usd: 0,
    guide_daily_fee_usd: 0,
    settlement_ratio: 0,
    guide_note: null,
    admin_note: null,
    reject_reason: null,
    submitted_at: null,
    reviewed_at: null,
    paid_at: null,
    edit_requested_at: null,
    reviewed_by: null,
    edit_requested_by: null,
    sent_for_confirmation_at: null,
    sent_for_confirmation_by: null,
    guide_confirmed_at: null,
    guide_confirmed_by: null,
    clarification_requested_at: null,
    clarification_message: null,
    active_confirmation_id: null,
    guide_submit_snapshot_id: null,
    calc_summary_json: null,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    tour: {
      id: 'tour-1',
      tour_code: 'DN-2026-001',
      pattern: 'Da Nang Family Tour',
      agency_name: 'Agency',
      start_date: '2026-05-20',
      end_date: '2026-05-24',
      nights: 4,
      pax_count: 12,
      vehicle_type: null,
      guide_id: 'guide-1',
      tc_name: null,
      branch_id: 'branch-1',
      assignment_status: 'assigned',
      recalled_at: null,
      recalled_by: null,
      created_by: 'admin-1',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
    },
    ...overrides,
  }
}

describe('guide settlement history filters', () => {
  const now = new Date('2026-06-04T00:00:00Z')

  it('parses status, period, and page filters safely', () => {
    expect(parseGuideHistoryStatus('submitted')).toBe('submitted')
    expect(parseGuideHistoryStatus('approved')).toBe('')
    expect(parseGuideHistoryStatus('nope')).toBe('')
    expect(parseGuideHistoryPeriod('7d')).toBe('7d')
    expect(parseGuideHistoryPeriod('30d')).toBe('30d')
    expect(parseGuideHistoryPeriod('current_month')).toBe('current_month')
    expect(parseGuideHistoryPeriod('prev_month')).toBe('prev_month')
    expect(parseGuideHistoryPeriod('custom')).toBe('custom')
    expect(parseGuideHistoryPeriod('all')).toBe('7d')
    expect(parseGuideHistoryPeriod('bad')).toBe('7d')
    expect(normalizeGuideHistoryPage('3')).toBe(3)
    expect(normalizeGuideHistoryPage('-1')).toBe(1)
  })

  it('defaults to 최근 7일 when no query params', () => {
    expect(parseGuideHistoryPeriod()).toBe('7d')
    expect(buildGuideHistoryUrl({})).toBe('/guide/settlements')
    expect(guideHistoryRecent7Days(now)).toEqual({ from: '2026-05-29', to: '2026-06-04' })
    expect(resolveGuideHistoryDateRange({}, now)).toEqual(guideHistoryRecent7Days(now))
  })

  it('resolves 최근 30일 period', () => {
    expect(guideHistoryRecent30Days(now)).toEqual({ from: '2026-05-06', to: '2026-06-04' })
    expect(resolveGuideHistoryDateRange({ period: '30d' }, now)).toEqual(
      guideHistoryRecent30Days(now),
    )
  })

  it('resolves 이번 달 and 지난 달 periods', () => {
    expect(resolveGuideHistoryDateRange({ period: 'current_month' }, now)).toEqual({
      from: '2026-06-01',
      to: '2026-06-30',
    })
    expect(resolveGuideHistoryDateRange({ period: 'prev_month' }, now)).toEqual({
      from: '2026-05-01',
      to: '2026-05-31',
    })
  })

  it('falls back to 최근 7일 when custom period is missing from or to', () => {
    const recent7 = guideHistoryRecent7Days(now)
    expect(resolveGuideHistoryDateRange({ period: 'custom' }, now)).toEqual(recent7)
    expect(resolveGuideHistoryDateRange({ period: 'custom', from: '2026-04-01' }, now)).toEqual(
      recent7,
    )
    expect(resolveGuideHistoryDateRange({ period: 'custom', to: '2026-04-30' }, now)).toEqual(
      recent7,
    )
  })

  it('resolves 직접 설정 with start and end dates', () => {
    expect(
      resolveGuideHistoryDateRange(
        { period: 'custom', from: '2026-04-01', to: '2026-04-30' },
        now,
      ),
    ).toEqual({ from: '2026-04-01', to: '2026-04-30' })
    expect(tourStartDateInGuideHistoryRange('2026-04-15', { from: '2026-04-01', to: '2026-04-30' })).toBe(
      true,
    )
    expect(tourStartDateInGuideHistoryRange('2026-03-31', { from: '2026-04-01', to: '2026-04-30' })).toBe(
      false,
    )
    expect(tourStartDateInGuideHistoryRange('2026-05-01', { from: '2026-04-01', to: '2026-04-30' })).toBe(
      false,
    )
  })

  it('expands guide status filters to legacy statuses without changing workflow values', () => {
    expect(expandGuideHistoryStatusFilter('edit_requested')).toEqual([
      'edit_requested',
      'rejected',
      'clarification_requested',
    ])
    expect(expandGuideHistoryStatusFilter('pending_guide_confirmation')).toEqual([
      'pending_guide_confirmation',
      'approved',
    ])
    expect(expandGuideHistoryStatusFilter()).toBeNull()
  })

  it('filters by status and period together', () => {
    const row = settlement({})
    expect(
      matchesGuideHistoryFilters(row, { status: 'submitted', period: '30d' }, now),
    ).toBe(true)
    expect(matchesGuideHistoryFilters(row, { status: 'draft', period: '30d' }, now)).toBe(false)
    expect(
      matchesGuideHistoryFilters(row, { status: 'submitted', period: '7d' }, now),
    ).toBe(false)
  })

  it('filters by search keyword and period together', () => {
    const row = settlement({})
    expect(
      matchesGuideHistoryFilters(row, { period: 'current_month', search: 'family' }, now),
    ).toBe(false)
    expect(
      matchesGuideHistoryFilters(
        settlement({
          tour: { ...settlement({}).tour!, start_date: '2026-06-10' },
        }),
        { period: 'current_month', search: 'DN-2026' },
        now,
      ),
    ).toBe(true)
    expect(
      matchesGuideHistoryFilters(row, { period: '30d', search: 'missing' }, now),
    ).toBe(false)
  })

  it('filters by status, period, and search keyword together', () => {
    const row = settlement({
      tour: { ...settlement({}).tour!, start_date: '2026-06-02' },
    })
    expect(
      matchesGuideHistoryFilters(
        row,
        { status: 'submitted', period: 'current_month', search: 'da nang' },
        now,
      ),
    ).toBe(true)
    expect(
      matchesGuideHistoryFilters(
        row,
        { status: 'draft', period: 'current_month', search: 'da nang' },
        now,
      ),
    ).toBe(false)
  })

  it('builds history URLs without default period and with custom dates', () => {
    expect(buildGuideHistoryUrl({ status: 'submitted', period: '30d', search: 'DN', page: 2 })).toBe(
      '/guide/settlements?status=submitted&period=30d&search=DN&page=2',
    )
    expect(
      buildGuideHistoryUrl({
        period: 'custom',
        from: '2026-04-01',
        to: '2026-04-30',
        search: '260403',
      }),
    ).toBe('/guide/settlements?period=custom&from=2026-04-01&to=2026-04-30&search=260403')
  })

  it('documents the required guide dashboard/history wiring', () => {
    const dashboard = readFileSync(join(ROOT, 'src/app/guide/page.tsx'), 'utf8')
    const historyPage = readFileSync(join(ROOT, 'src/app/guide/settlements/page.tsx'), 'utf8')
    const filterForm = readFileSync(
      join(ROOT, 'src/app/guide/settlements/GuideHistoryFilterForm.tsx'),
      'utf8',
    )

    expect(dashboard).toContain('전체 정산서 보기')
    expect(historyPage).toContain('getMySettlementHistory')
    expect(historyPage).toContain('GuideHistoryFilterForm')
    expect(historyPage).toContain('전체 정산서')
    expect(historyPage).toContain('GUIDE_HISTORY_EMPTY_MESSAGE')
    expect(historyPage).not.toContain('초기화')
    expect(filterForm).toContain('name="status"')
    expect(filterForm).toContain('name="period"')
    expect(filterForm).toContain('name="search"')
    expect(filterForm).toContain('name="from"')
    expect(filterForm).toContain('name="to"')
    expect(filterForm).toMatch(/name="from"[\s\S]*?required/)
    expect(filterForm).toMatch(/name="to"[\s\S]*?required/)
    expect(filterForm).toContain('GUIDE_HISTORY_PERIOD_HELPER')
    expect(filterForm).not.toContain('초기화')
    expect(filterForm).not.toContain('reset')
    expect(historyPage).toContain('settlementHref')
  })

  it('exposes helper and empty-state copy', () => {
    expect(GUIDE_HISTORY_PERIOD_HELPER).toBe(
      '기본 조회 기간은 최근 7일입니다. 기간을 변경하면 이전 정산서도 확인할 수 있습니다.',
    )
    expect(GUIDE_HISTORY_EMPTY_MESSAGE).toBe(
      '선택한 기간에 조회되는 정산서가 없습니다. 기간 또는 검색어를 변경해보세요.',
    )
  })

  it('documents the guide dashboard work-queue layout', () => {
    const dashboard = readFileSync(join(ROOT, 'src/app/guide/page.tsx'), 'utf8')

    expect(dashboard).not.toContain('정산 현황')
    expect(dashboard).not.toContain('grid-cols-4')
    expect(dashboard).not.toContain('검토중')
    expect(dashboard).not.toContain('확인대기')
    expect(dashboard).toContain('{session.full_name}님')
    expect(dashboard).not.toContain('{session.full_name} 가이드님')

    const greeting = dashboard.indexOf('안녕하세요')
    const assignedTours = dashboard.indexOf('배정된 투어')
    const draft = dashboard.indexOf('작성중')
    const editRequested = dashboard.indexOf('수정 필요')
    const pendingConfirmation = dashboard.indexOf('최종 확인 필요')
    const recent = dashboard.indexOf('최근 정산서')

    expect(greeting).toBeGreaterThan(-1)
    expect(assignedTours).toBeGreaterThan(greeting)
    expect(draft).toBeGreaterThan(assignedTours)
    expect(editRequested).toBeGreaterThan(draft)
    expect(pendingConfirmation).toBeGreaterThan(editRequested)
    expect(recent).toBeGreaterThan(pendingConfirmation)

    expect(dashboard).toContain('getGuideDashboardSettlements')
    expect(dashboard).toContain('draft: draftSettlements')
    expect(dashboard).toContain('이어 작성하기 →')
    expect(dashboard).toContain('href={`/guide/settlements/${s.id}/edit`}')
    expect(dashboard).toContain('href={`/guide/settlements/${s.id}/confirm`}')
    expect(dashboard).toContain('href="/guide/settlements"')
  })

  it('always renders the 작성중 section with an empty state', () => {
    const dashboard = readFileSync(join(ROOT, 'src/app/guide/page.tsx'), 'utf8')

    expect(dashboard).not.toContain('{draftSettlements.length > 0 && (')
    expect(dashboard).toContain('draftSettlements.length === 0 ? (')
    expect(dashboard).toContain('작성중인 정산서가 없습니다.')
    expect(dashboard).toContain('임시저장한 정산서가 있을 때 표시됩니다.')
  })

  it('documents guide ownership enforcement and date-range filtering in the server query', () => {
    const actions = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')

    expect(actions).toContain('export async function getMySettlementHistory')
    expect(actions).toContain(".from(tableForAudience('settlements', useGuideRead))")
    expect(actions).toContain(".eq('guide_id', user.id)")
    expect(actions).toContain(".from('tours')")
    expect(actions).toContain(".eq('guide_id', user.id)")
    expect(actions).toContain('resolveGuideHistoryDateRange')
    expect(actions).toContain(".gte('start_date', range.from)")
    expect(actions).toContain(".lte('start_date', range.to)")
  })

  it('keeps guide dashboard loading UI visible while sections load', () => {
    const loading = readFileSync(join(ROOT, 'src/app/guide/loading.tsx'), 'utf8')

    expect(loading).toContain('배정된 투어')
    expect(loading).toContain('작성중')
    expect(loading).toContain('수정 필요')
    expect(loading).toContain('최종 확인 필요')
    expect(loading).toContain('최근 정산서')
    expect(loading).toContain('bg-[#FCFAF7]')
    expect(loading).toContain('bg-[#FBE1CC]')
  })

  it('keeps guide settlements list loading UI visible while page loads', () => {
    const loading = readFileSync(join(ROOT, 'src/app/guide/settlements/loading.tsx'), 'utf8')

    expect(loading).toContain('전체 정산서 불러오는 중')
    expect(loading).toContain('rounded-2xl')
    expect(loading).toContain('animate-pulse')
  })

  it('uses a narrow guide dashboard settlement select instead of full rows', () => {
    const helper = readFileSync(join(ROOT, 'src/lib/guide/dashboard-settlements.ts'), 'utf8')

    expect(helper).toContain('GUIDE_DASHBOARD_SETTLEMENT_SELECT')
    expect(helper).toContain(GUIDE_DASHBOARD_SETTLEMENT_SELECT)
    expect(GUIDE_DASHBOARD_SETTLEMENT_SELECT).not.toContain('calc_summary_json')
  })

  function getMySettlementHistoryBody(): string {
    const actions = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')
    const start = actions.indexOf('export async function getMySettlementHistory')
    const end = actions.indexOf('export async function getSettlementFullForGuide', start)
    return actions.slice(start, end)
  }

  it('uses GUIDE_SETTLEMENT_HISTORY_SELECT in getMySettlementHistory', () => {
    const body = getMySettlementHistoryBody()
    expect(body).toContain('GUIDE_SETTLEMENT_HISTORY_SELECT')
    expect(body).toContain(".select(GUIDE_SETTLEMENT_HISTORY_SELECT, { count: 'exact' })")
    expect(body).not.toContain("select('*, tour:tours(*)'")
    expect(body).not.toContain('select("*"')
  })

  it('excludes calc_summary_json and heavy fields from history list select', () => {
    expect(GUIDE_SETTLEMENT_HISTORY_SELECT).not.toContain('*')
    expect(GUIDE_SETTLEMENT_HISTORY_SELECT).not.toContain('tour:tours(*)')
    expect(GUIDE_SETTLEMENT_HISTORY_SELECT).not.toContain('calc_summary_json')
    expect(GUIDE_SETTLEMENT_HISTORY_SELECT).not.toContain('guide_note')
    expect(GUIDE_SETTLEMENT_HISTORY_SELECT).not.toContain('admin_note')
  })

  it('includes settlement and tour fields used by guide settlements list cards', () => {
    const historyPage = readFileSync(join(ROOT, 'src/app/guide/settlements/page.tsx'), 'utf8')

    for (const field of [
      'id',
      'status',
      'guide_confirmed_at',
      'year_month',
      'reject_reason',
      'created_at',
    ]) {
      expect(GUIDE_SETTLEMENT_HISTORY_SELECT).toContain(field)
    }
    for (const tourField of [
      'tour_code',
      'pattern',
      'agency_name',
      'start_date',
      'end_date',
      'pax_count',
    ]) {
      expect(GUIDE_SETTLEMENT_HISTORY_SELECT).toContain(tourField)
    }
    expect(historyPage).toContain('s.tour?.pattern')
    expect(historyPage).toContain('s.year_month')
    expect(historyPage).toContain('s.reject_reason')
  })

  it('keeps default 7-day, custom fallback, status, search, pagination, and guide scope unchanged', () => {
    const body = getMySettlementHistoryBody()

    expect(body).toContain('resolveGuideHistoryDateRange')
    expect(body).toContain('parseGuideHistoryPeriod')
    expect(body).toContain('expandGuideHistoryStatusFilter')
    expect(body).toContain('escapeIlikePattern')
    expect(body).toContain('GUIDE_SETTLEMENT_HISTORY_PAGE_SIZE')
    expect(body).toContain("count: 'exact'")
    expect(body).toContain('.range(from, to)')
    expect(body).toContain(".eq('guide_id', user.id)")
    expect(body).toContain(".order('created_at', { ascending: false })")
    expect(body).toContain(".gte('start_date', range.from)")
    expect(body).toContain(".lte('start_date', range.to)")
  })

  it('does not modify settlement save files', () => {
    const noop = readFileSync(join(ROOT, 'src/lib/settlement/noop-draft-save-fast-path.ts'), 'utf8')
    expect(noop).toContain('canSkipPostSaveReloadForNoopSave')
    expect(noop).not.toContain('GUIDE_SETTLEMENT_HISTORY_SELECT')
  })
})
