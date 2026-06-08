import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SettlementStatus } from '@/types'
import {
  ADMIN_TOUR_ALL_VIEW_SUBTITLE,
  ADMIN_TOUR_EARLY_VIEW_SUBTITLE,
  ADMIN_TOUR_LIST_PATH,
  TOUR_ASSIGNMENT_RECALLED_LABEL,
  TOUR_SETTLEMENT_NONE_LABEL,
  adminTourDisplayLabel,
  adminTourQuickRangeUrls,
  buildAdminTourListHref,
  canRecallAdminTour,
  filterAdminToursForView,
  parseAdminTourDateSearchParams,
  sortAdminToursForList,
  tourSettlementStatusLabel,
} from './tour-list'

describe('sortAdminToursForList', () => {
  it('sorts by start_date asc, then tour_code asc, then id asc', () => {
    const tours = [
      { id: 'c', start_date: '2026-06-10', tour_code: 'B-200' },
      { id: 'a', start_date: '2026-06-01', tour_code: 'Z-900' },
      { id: 'd', start_date: '2026-06-10', tour_code: 'A-100' },
      { id: 'b2', start_date: '2026-06-10', tour_code: 'A-100' },
      { id: 'b1', start_date: '2026-06-10', tour_code: 'A-100' },
    ]

    expect(sortAdminToursForList(tours).map((t) => t.id)).toEqual([
      'a',
      'b1',
      'b2',
      'd',
      'c',
    ])
  })

  it('does not mutate the input array', () => {
    const tours = [
      { id: '2', start_date: '2026-02-01', tour_code: 'B' },
      { id: '1', start_date: '2026-01-01', tour_code: 'A' },
    ]
    const original = [...tours]
    sortAdminToursForList(tours)
    expect(tours).toEqual(original)
  })
})

describe('tourSettlementStatusLabel', () => {
  it('returns 정산서 미작성 when no settlement row exists', () => {
    expect(tourSettlementStatusLabel(null)).toBe(TOUR_SETTLEMENT_NONE_LABEL)
    expect(tourSettlementStatusLabel(undefined)).toBe(TOUR_SETTLEMENT_NONE_LABEL)
  })

  it('maps canonical statuses to tour-screen labels', () => {
    const cases: Array<[SettlementStatus, string]> = [
      ['draft', '작성중'],
      ['submitted', '제출됨'],
      ['edit_requested', '수정요청'],
      ['pending_guide_confirmation', '최종확인'],
      ['paid', '지급완료'],
    ]
    for (const [status, label] of cases) {
      expect(tourSettlementStatusLabel(status)).toBe(label)
    }
  })

  it('folds legacy statuses into the five-status display', () => {
    expect(tourSettlementStatusLabel('approved')).toBe('최종확인')
    expect(tourSettlementStatusLabel('rejected')).toBe('수정요청')
    expect(tourSettlementStatusLabel('clarification_requested')).toBe('수정요청')
  })
})

const tourRows = [
  {
    id: 'late-submitted',
    start_date: '2026-06-20',
    tour_code: 'B-200',
    settlement: { status: 'submitted' as SettlementStatus },
  },
  {
    id: 'no-settlement',
    start_date: '2026-06-01',
    tour_code: 'Z-900',
    settlement: null,
  },
  {
    id: 'draft',
    start_date: '2026-06-10',
    tour_code: 'A-100',
    settlement: { status: 'draft' as SettlementStatus },
  },
  {
    id: 'edit-requested',
    start_date: '2026-06-11',
    tour_code: 'C-100',
    settlement: { status: 'edit_requested' as SettlementStatus },
  },
  {
    id: 'pending',
    start_date: '2026-06-12',
    tour_code: 'D-100',
    settlement: { status: 'pending_guide_confirmation' as SettlementStatus },
  },
  {
    id: 'paid',
    start_date: '2026-06-13',
    tour_code: 'E-100',
    settlement: { status: 'paid' as SettlementStatus },
  },
]

describe('filterAdminToursForView', () => {
  it('default view includes no-settlement tours and draft/작성중 tours only', () => {
    expect(filterAdminToursForView(tourRows, 'early').map((t) => t.id)).toEqual([
      'no-settlement',
      'draft',
    ])
  })

  it('default view excludes settlement processing statuses', () => {
    const ids = filterAdminToursForView(tourRows, 'early').map((t) => t.id)
    expect(ids).not.toContain('late-submitted')
    expect(ids).not.toContain('edit-requested')
    expect(ids).not.toContain('pending')
    expect(ids).not.toContain('paid')
  })

  it('full view includes all statuses and keeps date sorting', () => {
    expect(filterAdminToursForView(tourRows, 'all').map((t) => t.id)).toEqual([
      'no-settlement',
      'draft',
      'edit-requested',
      'pending',
      'paid',
      'late-submitted',
    ])
  })

  it('exposes subtitles for default and full views', () => {
    expect(ADMIN_TOUR_EARLY_VIEW_SUBTITLE).toBe('정산서 미작성/작성중 투어')
    expect(ADMIN_TOUR_ALL_VIEW_SUBTITLE).toBe('전체 투어')
  })
})

describe('admin tour assignment recall (배정회수)', () => {
  const recalledNoSettlement = {
    id: 'recalled-none',
    start_date: '2026-06-02',
    tour_code: 'R-100',
    assignment_status: 'recalled' as const,
    settlement: null,
  }
  const recalledWithSettlement = {
    id: 'recalled-draft',
    start_date: '2026-06-03',
    tour_code: 'R-200',
    assignment_status: 'recalled' as const,
    settlement: { status: 'recalled' as SettlementStatus },
  }

  it('excludes recalled tours from the default early view', () => {
    const rows = [...tourRows, recalledNoSettlement, recalledWithSettlement]
    const ids = filterAdminToursForView(rows, 'early').map((t) => t.id)
    expect(ids).not.toContain('recalled-none')
    expect(ids).not.toContain('recalled-draft')
    expect(ids).toEqual(['no-settlement', 'draft'])
  })

  it('includes recalled tours in the full view', () => {
    const rows = [recalledNoSettlement, recalledWithSettlement]
    const ids = filterAdminToursForView(rows, 'all').map((t) => t.id)
    expect(ids).toContain('recalled-none')
    expect(ids).toContain('recalled-draft')
  })

  it('labels recalled tours 배정회수 regardless of residual settlement status', () => {
    expect(adminTourDisplayLabel(recalledNoSettlement)).toBe(TOUR_ASSIGNMENT_RECALLED_LABEL)
    expect(adminTourDisplayLabel(recalledWithSettlement)).toBe(TOUR_ASSIGNMENT_RECALLED_LABEL)
    expect(TOUR_ASSIGNMENT_RECALLED_LABEL).toBe('배정회수')
  })

  it('shows the recall button only for eligible (미작성/작성중/제출됨) tours', () => {
    expect(canRecallAdminTour({ assignment_status: 'assigned', settlement: null })).toBe(true)
    expect(
      canRecallAdminTour({ assignment_status: 'assigned', settlement: { status: 'draft' } }),
    ).toBe(true)
    expect(
      canRecallAdminTour({ assignment_status: 'assigned', settlement: { status: 'submitted' } }),
    ).toBe(true)
    // ineligible
    expect(
      canRecallAdminTour({ assignment_status: 'assigned', settlement: { status: 'edit_requested' } }),
    ).toBe(false)
    expect(
      canRecallAdminTour({
        assignment_status: 'assigned',
        settlement: { status: 'pending_guide_confirmation' },
      }),
    ).toBe(false)
    expect(
      canRecallAdminTour({ assignment_status: 'assigned', settlement: { status: 'paid' } }),
    ).toBe(false)
    expect(canRecallAdminTour(recalledNoSettlement)).toBe(false)
  })
})

describe('admin tour list date URLs', () => {
  const REF = new Date('2026-06-08T12:00:00Z')

  it('uses /admin/tours as the list path', () => {
    expect(ADMIN_TOUR_LIST_PATH).toBe('/admin/tours')
    const urls = adminTourQuickRangeUrls(REF)
    expect(urls.currentMonth).toBe('/admin/tours?from=2026-06-01&to=2026-06-30')
    expect(urls.all).toBe('/admin/tours?range=all')
  })

  it('preserves view=all in quick filter URLs', () => {
    const urls = adminTourQuickRangeUrls(REF, 'all')
    expect(urls.all).toBe('/admin/tours?range=all&view=all')
    expect(buildAdminTourListHref('2026-06-01', '2026-06-30', 'all')).toBe(
      '/admin/tours?from=2026-06-01&to=2026-06-30&view=all',
    )
  })

  it('delegates date parsing for the tour page', () => {
    expect(parseAdminTourDateSearchParams(undefined, REF).from).toBe('2026-06-01')
  })
})

describe('getAdminTours list query (source-level)', () => {
  const TOUR_ACTIONS_SRC = readFileSync('src/lib/actions/tourActions.ts', 'utf8')

  function getAdminToursBody(): string {
    const start = TOUR_ACTIONS_SRC.indexOf('export async function getAdminTours')
    const end = TOUR_ACTIONS_SRC.indexOf('export async function getBranches', start)
    return TOUR_ACTIONS_SRC.slice(start, end)
  }

  it('applies branch_id and date filters in DB before limit', () => {
    const body = getAdminToursBody()
    expect(body).toContain('AdminDateRangeFilter')
    expect(body).toContain("tourQuery.eq('branch_id', ctx.branch_id)")
    expect(body).toContain("filter.range !== 'all'")
    expect(body).toMatch(/if \(filter\.from\) tourQuery = tourQuery\.gte\('start_date', filter\.from\)/)
    expect(body).toMatch(/if \(filter\.to\) tourQuery = tourQuery\.lte\('start_date', filter\.to\)/)
    const branchIdx = body.indexOf("tourQuery.eq('branch_id'")
    const gteIdx = body.indexOf("filter.from) tourQuery")
    const limitIdx = body.indexOf('.limit(listLimit)')
    const orderIdx = body.indexOf(".order('start_date'")
    expect(branchIdx).toBeGreaterThan(-1)
    expect(gteIdx).toBeGreaterThan(branchIdx)
    expect(orderIdx).toBeGreaterThan(gteIdx)
    expect(limitIdx).toBeGreaterThan(orderIdx)
  })

  it('does not require settlements to list tours', () => {
    const body = getAdminToursBody()
    expect(body).toMatch(/\.from\(['"]tours['"]\)/)
    const toursIdx = body.indexOf(".from('tours')")
    const settlementsIdx = body.indexOf(".from('settlements')")
    expect(settlementsIdx).toBeGreaterThan(toursIdx)
    expect(body).not.toMatch(/inner.*settlements/i)
  })

  it('loads settlements only as optional enrichment after tour query', () => {
    const body = getAdminToursBody()
    expect(body).toContain(".in('tour_id', tourIds)")
  })
})

describe('/admin/tours card UI source', () => {
  const source = readFileSync('src/app/admin/tours/page.tsx', 'utf8')
  const filterSrc = readFileSync('src/app/admin/tours/AdminTourDateFilter.tsx', 'utf8')

  it('does not render redundant assigned-guide or guide-change UI', () => {
    expect(source).not.toContain('가이드 배정됨')
    expect(source).not.toContain('가이드 선택 가능')
    expect(source).not.toContain('가이드 변경')
  })

  it('wires the assignment-recall button for eligible tours only', () => {
    expect(source).toContain('canRecallAdminTour')
    expect(source).toContain('RecallAssignmentButton')
    expect(source).toContain('recallable && <RecallAssignmentButton')
  })

  it('keeps the guide name line, settlement status badge, and settlement detail link', () => {
    expect(source).toContain('가이드: {t.guide?.full_name')
    expect(source).toContain('정산서: {settlementLabel}')
    expect(source).toContain('/admin/settlements/${t.settlement.id}')
  })

  it('does not introduce display truncation for tour names', () => {
    expect(source).not.toContain('truncate')
    expect(source).toContain('break-words')
  })

  it('uses an explicit full tour view instead of showing all statuses by default', () => {
    expect(source).toContain("params.view === 'all' ? 'all' : 'early'")
    expect(source).toContain('전체 투어 보기')
    expect(source).toContain('미작성/작성중 보기')
  })

  it('wires shareable date filters without delete/archive controls', () => {
    expect(source).toContain('parseAdminTourDateSearchParams')
    expect(source).toContain('getAdminTours(dateFilter)')
    expect(source).toContain('AdminTourDateFilterBar')
    expect(source).not.toMatch(/delete|archive|삭제/i)
  })

  it('date filter bar matches vehicle assignment filter layout', () => {
    expect(filterSrc).toContain('오늘 이후')
    expect(filterSrc).toContain('이번 달')
    expect(filterSrc).toContain('다음 달')
    expect(filterSrc).toContain('지난 달')
    expect(filterSrc).toContain('전체')
    expect(filterSrc).toContain('조회')
    expect(filterSrc).toContain('ADMIN_DATE_RANGE_CURRENT_MONTH_NOTICE')
    expect(filterSrc).toContain('ADMIN_DATE_RANGE_ALL_WARNING')
    expect(filterSrc).toContain('adminTourQuickRangeUrls')
    expect(filterSrc).not.toMatch(/delete|archive|삭제/i)
  })
})

describe('/admin/tours/new form source', () => {
  const source = readFileSync('src/app/admin/tours/new/CreateTourForm.tsx', 'utf8')

  it('caps the three main registration text fields at 20 characters', () => {
    expect(source.match(/maxLength=\{TOUR_REGISTRATION_TEXT_MAX_LENGTH\}/g)).toHaveLength(3)
  })

  it('does not add visible 20-character warning copy', () => {
    expect(source).not.toContain('20자')
    expect(source).not.toContain('20 characters')
  })
})
