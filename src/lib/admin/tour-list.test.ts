import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SettlementStatus } from '@/types'
import {
  ADMIN_TOUR_ALL_VIEW_SUBTITLE,
  ADMIN_TOUR_EARLY_VIEW_SUBTITLE,
  TOUR_SETTLEMENT_NONE_LABEL,
  filterAdminToursForView,
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

describe('/admin/tours card UI source', () => {
  const source = readFileSync('src/app/admin/tours/page.tsx', 'utf8')

  it('does not render redundant assigned-guide or guide-change UI', () => {
    expect(source).not.toContain('가이드 배정됨')
    expect(source).not.toContain('가이드 선택 가능')
    expect(source).not.toContain('가이드 변경')
    expect(source).not.toContain('배정회수')
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
