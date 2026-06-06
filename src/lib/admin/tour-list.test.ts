import { describe, expect, it } from 'vitest'
import type { SettlementStatus } from '@/types'
import {
  TOUR_GUIDE_ASSIGNED_LABEL,
  TOUR_GUIDE_UNASSIGNED_LABEL,
  TOUR_SETTLEMENT_NONE_LABEL,
  isTourGuideAssigned,
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

describe('isTourGuideAssigned', () => {
  it('is true when a guide is assigned and false otherwise', () => {
    expect(isTourGuideAssigned({ guide_id: 'guide-1' })).toBe(true)
    expect(isTourGuideAssigned({ guide_id: null })).toBe(false)
    expect(isTourGuideAssigned({})).toBe(false)
  })

  it('exposes assigned/unassigned labels for the UI', () => {
    expect(TOUR_GUIDE_ASSIGNED_LABEL).toBe('가이드 배정됨')
    expect(TOUR_GUIDE_UNASSIGNED_LABEL).toBe('가이드 배정 필요')
  })
})
