import { describe, expect, it } from 'vitest'
import {
  ADMIN_DATE_RANGE_ALL_WARNING,
  ADMIN_DATE_RANGE_CURRENT_MONTH_NOTICE,
  currentMonthRange,
  filterToursByAdminDateRange,
  isTourInAdminDateRange,
  nextMonthRange,
  parseAdminDateRangeSearchParams,
  prevMonthRange,
  todayUtcString,
} from './date-range-filter'

const REF = new Date('2026-06-08T12:00:00Z')

describe('admin date range filter (shared)', () => {
  it('defaults to the current calendar month when no params', () => {
    const filter = parseAdminDateRangeSearchParams(undefined, REF)
    expect(filter).toEqual({
      range: 'current_month',
      from: '2026-06-01',
      to: '2026-06-30',
    })
    expect(ADMIN_DATE_RANGE_CURRENT_MONTH_NOTICE).toBe('기본값: 이번 달 투어만 표시됩니다.')
  })

  it('hides tours outside the default current month', () => {
    const filter = parseAdminDateRangeSearchParams(undefined, REF)
    expect(isTourInAdminDateRange('2026-05-31', filter)).toBe(false)
    expect(isTourInAdminDateRange('2026-07-01', filter)).toBe(false)
    const visible = filterToursByAdminDateRange(
      [
        { id: 'old', start_date: '2026-05-15' },
        { id: 'in', start_date: '2026-06-08' },
      ],
      filter,
    )
    expect(visible.map((t) => t.id)).toEqual(['in'])
  })

  it('shows current-month tour', () => {
    const filter = parseAdminDateRangeSearchParams(undefined, REF)
    expect(isTourInAdminDateRange('2026-06-08', filter)).toBe(true)
  })

  it('shows today/future tours with 오늘 이후 filter', () => {
    const filter = parseAdminDateRangeSearchParams({ from: '2026-06-08' }, REF)
    expect(filter.range).toBe('from_today')
    expect(isTourInAdminDateRange('2026-12-01', filter)).toBe(true)
    expect(isTourInAdminDateRange('2026-06-07', filter)).toBe(false)
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

  it('computes month boundaries', () => {
    expect(currentMonthRange(REF)).toEqual({ from: '2026-06-01', to: '2026-06-30' })
    expect(nextMonthRange(REF)).toEqual({ from: '2026-07-01', to: '2026-07-31' })
    expect(prevMonthRange(REF)).toEqual({ from: '2026-05-01', to: '2026-05-31' })
    expect(todayUtcString(REF)).toBe('2026-06-08')
  })
})
