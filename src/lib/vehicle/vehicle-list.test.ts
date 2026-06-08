import { describe, expect, it } from 'vitest'
import {
  filterToursByAdminDateRange,
  isTourInAdminDateRange,
  nextMonthRange,
  prevMonthRange,
} from '@/lib/admin/date-range-filter'
import {
  buildVehicleDashboardHref,
  parseVehicleDashboardSearchParams,
  VEHICLE_DASHBOARD_CURRENT_MONTH_NOTICE,
  VEHICLE_DASHBOARD_PATH,
  vehicleDashboardQuickRangeUrls,
} from './vehicle-list'

const REF = new Date('2026-06-08T12:00:00Z')

describe('vehicle dashboard date filter', () => {
  it('defaults to current month for /vehicle', () => {
    const filter = parseVehicleDashboardSearchParams(undefined, REF)
    expect(filter).toEqual({
      range: 'current_month',
      from: '2026-06-01',
      to: '2026-06-30',
    })
    expect(VEHICLE_DASHBOARD_CURRENT_MONTH_NOTICE).toBe('기본값: 이번 달 배정 행사만 표시됩니다.')
    expect(VEHICLE_DASHBOARD_PATH).toBe('/vehicle')
  })

  it('hides tours outside the default current month', () => {
    const filter = parseVehicleDashboardSearchParams(undefined, REF)
    expect(isTourInAdminDateRange('2026-05-15', filter)).toBe(false)
    const visible = filterToursByAdminDateRange(
      [
        { start_date: '2026-05-15' },
        { start_date: '2026-06-08' },
      ],
      filter,
    )
    expect(visible).toHaveLength(1)
  })

  it('shows current-month assigned tour with no report', () => {
    const filter = parseVehicleDashboardSearchParams(undefined, REF)
    expect(isTourInAdminDateRange('2026-06-08', filter)).toBe(true)
  })

  it('supports 오늘 이후, 다음 달, 지난 달, custom, and 전체', () => {
    expect(parseVehicleDashboardSearchParams({ from: '2026-06-08' }, REF).range).toBe('from_today')
    const next = nextMonthRange(REF)
    expect(parseVehicleDashboardSearchParams({ from: next.from, to: next.to }, REF).range).toBe(
      'next_month',
    )
    const prev = prevMonthRange(REF)
    expect(parseVehicleDashboardSearchParams({ from: prev.from, to: prev.to }, REF).range).toBe(
      'prev_month',
    )
    expect(
      parseVehicleDashboardSearchParams({ from: '2026-05-10', to: '2026-05-20' }, REF).range,
    ).toBe('custom')
    expect(parseVehicleDashboardSearchParams({ range: 'all' }, REF).range).toBe('all')
    expect(isTourInAdminDateRange('2024-01-01', parseVehicleDashboardSearchParams({ range: 'all' }, REF))).toBe(
      true,
    )
  })

  it('exposes shareable quick filter URLs', () => {
    const urls = vehicleDashboardQuickRangeUrls(REF)
    expect(urls.currentMonth).toBe('/vehicle?from=2026-06-01&to=2026-06-30')
    expect(urls.all).toBe('/vehicle?range=all')
    expect(buildVehicleDashboardHref('2026-06-01', '2026-06-30')).toBe(
      '/vehicle?from=2026-06-01&to=2026-06-30',
    )
  })
})
