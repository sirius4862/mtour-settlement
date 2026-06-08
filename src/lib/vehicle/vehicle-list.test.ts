import { describe, expect, it } from 'vitest'
import {
  currentMonthRange,
  filterToursByAdminDateRange,
  forwardWeekRange,
  isTourInAdminDateRange,
  nextMonthRange,
  prevMonthRange,
} from '@/lib/admin/date-range-filter'
import { readFileSync } from 'node:fs'
import {
  buildVehicleDashboardHref,
  isVehicleCompanyTourAccessible,
  parseVehicleDashboardSearchParams,
  RECALLED_VEHICLE_TOUR_ERROR,
  VEHICLE_DASHBOARD_DEFAULT_RANGE_NOTICE,
  VEHICLE_DASHBOARD_PATH,
  vehicleDashboardQuickRangeUrls,
} from './vehicle-list'

const ACTIONS_SRC = readFileSync('src/lib/actions/vehicleReportActions.ts', 'utf8')

const REF = new Date('2026-06-08T12:00:00Z')

describe('vehicle dashboard date filter', () => {
  it('defaults to today through today + 7 days for /vehicle', () => {
    const filter = parseVehicleDashboardSearchParams(undefined, REF)
    expect(filter).toEqual({
      range: 'forward_week',
      from: '2026-06-08',
      to: '2026-06-15',
    })
    expect(VEHICLE_DASHBOARD_DEFAULT_RANGE_NOTICE).toBe(
      '기본값: 오늘부터 7일간 배정 행사만 표시됩니다.',
    )
    expect(VEHICLE_DASHBOARD_PATH).toBe('/vehicle')
  })

  it('hides tours outside the default forward week', () => {
    const filter = parseVehicleDashboardSearchParams(undefined, REF)
    expect(isTourInAdminDateRange('2026-06-07', filter)).toBe(false)
    expect(isTourInAdminDateRange('2026-06-16', filter)).toBe(false)
    const visible = filterToursByAdminDateRange(
      [
        { start_date: '2026-06-07' },
        { start_date: '2026-06-08' },
        { start_date: '2026-06-15' },
      ],
      filter,
    )
    expect(visible).toHaveLength(2)
  })

  it('shows forward-week assigned tour with no report', () => {
    const filter = parseVehicleDashboardSearchParams(undefined, REF)
    expect(isTourInAdminDateRange('2026-06-08', filter)).toBe(true)
  })

  it('supports 오늘 이후, 최근 7일, 이번 달, 다음 달, 지난 달, custom, and 전체', () => {
    expect(parseVehicleDashboardSearchParams({ from: '2026-06-08' }, REF).range).toBe('from_today')
    const forward = forwardWeekRange(REF)
    expect(
      parseVehicleDashboardSearchParams({ from: forward.from, to: forward.to }, REF).range,
    ).toBe('forward_week')
    const current = currentMonthRange(REF)
    expect(
      parseVehicleDashboardSearchParams({ from: current.from, to: current.to }, REF).range,
    ).toBe('current_month')
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
    expect(urls.forwardWeek).toBe('/vehicle?from=2026-06-08&to=2026-06-15')
    expect(urls.currentMonth).toBe('/vehicle?from=2026-06-01&to=2026-06-30')
    expect(urls.all).toBe('/vehicle?range=all')
    expect(buildVehicleDashboardHref('2026-06-08', '2026-06-15')).toBe(
      '/vehicle?from=2026-06-08&to=2026-06-15',
    )
  })
})

describe('vehicle company tour access — recalled assignment guard', () => {
  it('isVehicleCompanyTourAccessible allows assigned and treats null as assigned', () => {
    expect(isVehicleCompanyTourAccessible('assigned')).toBe(true)
    expect(isVehicleCompanyTourAccessible(null)).toBe(true)
    expect(isVehicleCompanyTourAccessible(undefined)).toBe(true)
  })

  it('isVehicleCompanyTourAccessible blocks recalled tours', () => {
    expect(isVehicleCompanyTourAccessible('recalled')).toBe(false)
  })

  it('exposes the recalled-tour edit error message', () => {
    expect(RECALLED_VEHICLE_TOUR_ERROR).toBe(
      'This tour assignment has been recalled and can no longer be edited.',
    )
  })

  it('getVehicleCompanyAssignedTours excludes recalled tours at the DB query', () => {
    const fnStart = ACTIONS_SRC.indexOf('export async function getVehicleCompanyAssignedTours')
    const fnEnd = ACTIONS_SRC.indexOf('export async function getVehicleReportForTour', fnStart)
    const body = ACTIONS_SRC.slice(fnStart, fnEnd)
    const profileIdx = body.indexOf("vehicle_company_profile_id', ctx.profileId")
    const recalledIdx = body.indexOf(".neq('assignment_status', 'recalled')")
    expect(recalledIdx).toBeGreaterThan(profileIdx)
    expect(recalledIdx).toBeGreaterThan(-1)
  })
})
