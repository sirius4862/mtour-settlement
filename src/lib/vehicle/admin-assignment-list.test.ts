import { describe, expect, it } from 'vitest'
import {
  currentMonthRange,
  forwardWeekRange,
  nextMonthRange,
  prevMonthRange,
  todayUtcString,
} from '@/lib/admin/date-range-filter'
import {
  buildVehicleAssignmentTourListItems,
  buildVehicleAssignmentListHref,
  filterVehicleAssignmentToursByDateRange,
  filterVehicleAssignmentToursByScope,
  isTourInVehicleAssignmentDateRange,
  parseVehicleAssignmentSearchParams,
  vehicleAssignmentQuickRangeUrls,
  VEHICLE_ASSIGNMENT_ALL_RANGE_WARNING,
  VEHICLE_ASSIGNMENT_DEFAULT_RANGE_NOTICE,
} from './admin-assignment-list'

const DANANG = 'branch-danang'
const HANOI = 'branch-hanoi'
const REF = new Date('2026-06-08T12:00:00Z')

describe('buildVehicleAssignmentTourListItems', () => {
  it('includes unassigned tour with null vehicle_company_profile_id', () => {
    const items = buildVehicleAssignmentTourListItems(
      [{
        id: 't-new',
        tour_code: '260608',
        start_date: '2026-06-08',
        end_date: '2026-06-10',
        branch_id: DANANG,
        vehicle_company_profile_id: null,
        guide_name: 'Guide A',
      }],
      new Map(),
      new Map(),
    )
    expect(items).toHaveLength(1)
    expect(items[0].vehicle_company_profile_id).toBeNull()
    expect(items[0].report_status).toBe('none')
    expect(items[0].assignment_status).toBe('unassigned')
    expect(items[0].vehicle_company_name).toBeNull()
  })

  it('includes tour without a vehicle_route_reports row', () => {
    const items = buildVehicleAssignmentTourListItems(
      [{
        id: 't-no-report',
        tour_code: '260608',
        start_date: '2026-06-08',
        end_date: null,
        branch_id: DANANG,
        vehicle_company_profile_id: null,
        guide_name: null,
      }],
      new Map(),
      new Map(),
    )
    expect(items[0].report_status).toBe('none')
    expect(items[0].assignment_status).toBe('unassigned')
  })

  it('enriches assigned tour with report status when report exists', () => {
    const profileId = 'vc-profile-1'
    const items = buildVehicleAssignmentTourListItems(
      [{
        id: 't1',
        tour_code: '260403',
        start_date: '2026-04-03',
        end_date: null,
        branch_id: DANANG,
        vehicle_company_profile_id: profileId,
        guide_name: 'G',
      }],
      new Map([['t1', 'draft']]),
      new Map([[profileId, 'Hanna Transport']]),
    )
    expect(items[0].assignment_status).toBe('draft')
    expect(items[0].report_status).toBe('draft')
    expect(items[0].vehicle_company_name).toBe('Hanna Transport')
  })
})

describe('vehicle assignment date range filter', () => {
  it('defaults to today through today + 7 days when no params', () => {
    const filter = parseVehicleAssignmentSearchParams(undefined, REF)
    expect(filter).toEqual({
      range: 'forward_week',
      from: '2026-06-08',
      to: '2026-06-15',
    })
    expect(VEHICLE_ASSIGNMENT_DEFAULT_RANGE_NOTICE).toBe(
      '기본값: 오늘부터 7일간의 투어만 표시됩니다.',
    )
  })

  it('hides tours outside the default forward week', () => {
    const filter = parseVehicleAssignmentSearchParams(undefined, REF)
    expect(isTourInVehicleAssignmentDateRange('2026-06-07', filter)).toBe(false)
    expect(isTourInVehicleAssignmentDateRange('2026-06-16', filter)).toBe(false)
    const visible = filterVehicleAssignmentToursByDateRange(
      [
        { id: 'old', start_date: '2026-06-07', branch_id: DANANG },
        { id: 'in', start_date: '2026-06-08', branch_id: DANANG },
      ],
      filter,
    )
    expect(visible.map((t) => t.id)).toEqual(['in'])
  })

  it('shows forward-week unassigned tour without a vehicle report', () => {
    const filter = parseVehicleAssignmentSearchParams(undefined, REF)
    const items = buildVehicleAssignmentTourListItems(
      [{
        id: 't-recent',
        tour_code: '260608',
        start_date: '2026-06-08',
        end_date: null,
        branch_id: DANANG,
        vehicle_company_profile_id: null,
        guide_name: null,
      }],
      new Map(),
      new Map(),
    )
    expect(isTourInVehicleAssignmentDateRange('2026-06-08', filter)).toBe(true)
    expect(items[0].vehicle_company_profile_id).toBeNull()
    expect(items[0].report_status).toBe('none')
  })

  it('shows future tours with 오늘 이후 filter', () => {
    const filter = parseVehicleAssignmentSearchParams({ from: '2026-06-08' }, REF)
    expect(filter.range).toBe('from_today')
    expect(isTourInVehicleAssignmentDateRange('2026-12-01', filter)).toBe(true)
    expect(isTourInVehicleAssignmentDateRange('2026-06-07', filter)).toBe(false)
  })

  it('shows future tours with next month filter', () => {
    const next = nextMonthRange(REF)
    const filter = parseVehicleAssignmentSearchParams({ from: next.from, to: next.to }, REF)
    expect(filter.range).toBe('next_month')
    expect(isTourInVehicleAssignmentDateRange('2026-07-15', filter)).toBe(true)
    expect(isTourInVehicleAssignmentDateRange('2026-06-30', filter)).toBe(false)
  })

  it('supports custom from/to date range', () => {
    const filter = parseVehicleAssignmentSearchParams(
      { from: '2026-05-10', to: '2026-05-20' },
      REF,
    )
    expect(filter.range).toBe('custom')
    expect(isTourInVehicleAssignmentDateRange('2026-05-15', filter)).toBe(true)
    expect(isTourInVehicleAssignmentDateRange('2026-05-21', filter)).toBe(false)
    expect(buildVehicleAssignmentListHref('2026-05-10', '2026-05-20')).toBe(
      '/admin/vehicle-assignments?from=2026-05-10&to=2026-05-20',
    )
  })

  it('전체 filter can show older tours', () => {
    const filter = parseVehicleAssignmentSearchParams({ range: 'all' }, REF)
    expect(filter.range).toBe('all')
    expect(filter.from).toBeNull()
    expect(filter.to).toBeNull()
    expect(isTourInVehicleAssignmentDateRange('2024-01-01', filter)).toBe(true)
    expect(VEHICLE_ASSIGNMENT_ALL_RANGE_WARNING).toBe('전체 조회는 데이터가 많을 수 있습니다.')
  })

  it('supports 최근 7일 forward-week quick filter', () => {
    const forward = forwardWeekRange(REF)
    const filter = parseVehicleAssignmentSearchParams({ from: forward.from, to: forward.to }, REF)
    expect(filter.range).toBe('forward_week')
    expect(isTourInVehicleAssignmentDateRange('2026-06-15', filter)).toBe(true)
    expect(isTourInVehicleAssignmentDateRange('2026-06-16', filter)).toBe(false)
  })

  it('exposes quick filter URLs for shareable navigation', () => {
    const urls = vehicleAssignmentQuickRangeUrls(REF)
    expect(urls.fromToday).toBe('/admin/vehicle-assignments?from=2026-06-08')
    expect(urls.forwardWeek).toBe('/admin/vehicle-assignments?from=2026-06-08&to=2026-06-15')
    expect(urls.currentMonth).toBe('/admin/vehicle-assignments?from=2026-06-01&to=2026-06-30')
    expect(urls.nextMonth).toBe('/admin/vehicle-assignments?from=2026-07-01&to=2026-07-31')
    expect(urls.prevMonth).toBe('/admin/vehicle-assignments?from=2026-05-01&to=2026-05-31')
    expect(urls.all).toBe('/admin/vehicle-assignments?range=all')
    expect(currentMonthRange(REF)).toEqual({ from: '2026-06-01', to: '2026-06-30' })
    expect(prevMonthRange(REF)).toEqual({ from: '2026-05-01', to: '2026-05-31' })
    expect(todayUtcString(REF)).toBe('2026-06-08')
  })
})

describe('filterVehicleAssignmentToursByScope', () => {
  const tours = [
    { id: '1', branch_id: DANANG, tour_code: '260608' },
    { id: '2', branch_id: HANOI, tour_code: '260417' },
  ]

  it('branch admin sees same-branch tours only', () => {
    const visible = filterVehicleAssignmentToursByScope(tours, {
      role: 'admin',
      assignedRegionId: DANANG,
    })
    expect(visible.map((t) => t.tour_code)).toEqual(['260608'])
  })

  it('branch admin does not see other-branch tours', () => {
    const visible = filterVehicleAssignmentToursByScope(tours, {
      role: 'admin',
      assignedRegionId: DANANG,
    })
    expect(visible.some((t) => t.branch_id === HANOI)).toBe(false)
  })

  it('master_admin sees all branches', () => {
    const visible = filterVehicleAssignmentToursByScope(tours, {
      role: 'master_admin',
      assignedRegionId: DANANG,
    })
    expect(visible).toHaveLength(2)
  })
})
