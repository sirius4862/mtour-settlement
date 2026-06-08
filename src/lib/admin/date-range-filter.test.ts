import { describe, expect, it } from 'vitest'
import {
  ADMIN_DATE_RANGE_ALL_WARNING,
  ADMIN_DATE_RANGE_DEFAULT_NOTICE,
  currentMonthRange,
  filterToursByAdminDateRange,
  forwardWeekRange,
  isTourInAdminDateRange,
  nextMonthRange,
  parseAdminDateRangeSearchParams,
  prevMonthRange,
  recentWeekRange,
  todayUtcString,
} from './date-range-filter'

const REF = new Date('2026-06-08T12:00:00Z')

describe('admin date range filter (shared)', () => {
  it('defaults to today through today + 7 days when no params', () => {
    const filter = parseAdminDateRangeSearchParams(undefined, REF)
    expect(filter).toEqual({
      range: 'forward_week',
      from: '2026-06-08',
      to: '2026-06-15',
    })
    expect(ADMIN_DATE_RANGE_DEFAULT_NOTICE).toBe('기본값: 오늘부터 7일간의 투어만 표시됩니다.')
  })

  it('hides tours outside the default forward week', () => {
    const filter = parseAdminDateRangeSearchParams(undefined, REF)
    expect(isTourInAdminDateRange('2026-06-07', filter)).toBe(false)
    expect(isTourInAdminDateRange('2026-06-16', filter)).toBe(false)
    const visible = filterToursByAdminDateRange(
      [
        { id: 'old', start_date: '2026-06-07' },
        { id: 'in', start_date: '2026-06-08' },
        { id: 'end', start_date: '2026-06-15' },
        { id: 'future', start_date: '2026-06-16' },
      ],
      filter,
    )
    expect(visible.map((t) => t.id)).toEqual(['in', 'end'])
  })

  it('shows tours inside the default forward week', () => {
    const filter = parseAdminDateRangeSearchParams(undefined, REF)
    expect(isTourInAdminDateRange('2026-06-08', filter)).toBe(true)
    expect(isTourInAdminDateRange('2026-06-15', filter)).toBe(true)
  })

  it('shows today/future tours with 오늘 이후 filter', () => {
    const filter = parseAdminDateRangeSearchParams({ from: '2026-06-08' }, REF)
    expect(filter.range).toBe('from_today')
    expect(isTourInAdminDateRange('2026-12-01', filter)).toBe(true)
    expect(isTourInAdminDateRange('2026-06-07', filter)).toBe(false)
  })

  it('supports 최근 7일 forward-week quick filter', () => {
    const forward = forwardWeekRange(REF)
    const filter = parseAdminDateRangeSearchParams({ from: forward.from, to: forward.to }, REF)
    expect(filter.range).toBe('forward_week')
    expect(isTourInAdminDateRange('2026-06-15', filter)).toBe(true)
    expect(isTourInAdminDateRange('2026-06-16', filter)).toBe(false)
  })

  it('supports 이번 달 filter', () => {
    const current = currentMonthRange(REF)
    const filter = parseAdminDateRangeSearchParams({ from: current.from, to: current.to }, REF)
    expect(filter.range).toBe('current_month')
    expect(isTourInAdminDateRange('2026-06-08', filter)).toBe(true)
    expect(isTourInAdminDateRange('2026-05-31', filter)).toBe(false)
  })

  it('supports 다음 달 filter', () => {
    const next = nextMonthRange(REF)
    const filter = parseAdminDateRangeSearchParams({ from: next.from, to: next.to }, REF)
    expect(filter.range).toBe('next_month')
    expect(isTourInAdminDateRange('2026-07-10', filter)).toBe(true)
    expect(isTourInAdminDateRange('2026-06-30', filter)).toBe(false)
  })

  it('supports 지난 달 filter', () => {
    const prev = prevMonthRange(REF)
    const filter = parseAdminDateRangeSearchParams({ from: prev.from, to: prev.to }, REF)
    expect(filter.range).toBe('prev_month')
    expect(isTourInAdminDateRange('2026-05-15', filter)).toBe(true)
    expect(isTourInAdminDateRange('2026-06-01', filter)).toBe(false)
  })

  it('supports custom from/to date range', () => {
    const filter = parseAdminDateRangeSearchParams(
      { from: '2026-05-10', to: '2026-05-20' },
      REF,
    )
    expect(filter.range).toBe('custom')
    expect(isTourInAdminDateRange('2026-05-15', filter)).toBe(true)
    expect(isTourInAdminDateRange('2026-05-21', filter)).toBe(false)
  })

  it('전체 filter can show older tours', () => {
    const filter = parseAdminDateRangeSearchParams({ range: 'all' }, REF)
    expect(filter.range).toBe('all')
    expect(isTourInAdminDateRange('2024-01-01', filter)).toBe(true)
    expect(ADMIN_DATE_RANGE_ALL_WARNING).toBe('전체 조회는 데이터가 많을 수 있습니다.')
  })

  it('computes week and month boundaries', () => {
    expect(forwardWeekRange(REF)).toEqual({ from: '2026-06-08', to: '2026-06-15' })
    expect(recentWeekRange(REF)).toEqual({ startDate: '2026-06-01', endDate: '2026-06-08' })
    expect(currentMonthRange(REF)).toEqual({ from: '2026-06-01', to: '2026-06-30' })
    expect(nextMonthRange(REF)).toEqual({ from: '2026-07-01', to: '2026-07-31' })
    expect(prevMonthRange(REF)).toEqual({ from: '2026-05-01', to: '2026-05-31' })
    expect(todayUtcString(REF)).toBe('2026-06-08')
  })
})
