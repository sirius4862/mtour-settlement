import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  GUIDE_VEHICLE_REPORT_EMPTY_MESSAGE,
  GUIDE_VEHICLE_REPORT_PERIOD_HELPER,
  buildGuideVehicleReportsUrl,
  filterGuideVehicleReportsByPeriod,
  parseGuideVehicleReportPeriod,
  resolveGuideVehicleReportDateRange,
  tourStartDateInGuideVehicleReportRange,
} from './guide-vehicle-report-list'

const ROOT = process.cwd()
const now = new Date('2026-06-04T00:00:00Z')

describe('guide vehicle report list period filter', () => {
  it('defaults to 최근 7일 when no query params', () => {
    expect(parseGuideVehicleReportPeriod()).toBe('7d')
    expect(buildGuideVehicleReportsUrl()).toBe('/guide/vehicle-reports')
    expect(buildGuideVehicleReportsUrl(undefined)).toBe('/guide/vehicle-reports')
    expect(resolveGuideVehicleReportDateRange({}, now)).toEqual({
      from: '2026-05-29',
      to: '2026-06-04',
    })
  })

  it('resolves period=7d, 30d, 60d, and 180d', () => {
    expect(resolveGuideVehicleReportDateRange({ period: '7d' }, now)).toEqual({
      from: '2026-05-29',
      to: '2026-06-04',
    })
    expect(resolveGuideVehicleReportDateRange({ period: '30d' }, now)).toEqual({
      from: '2026-05-06',
      to: '2026-06-04',
    })
    expect(resolveGuideVehicleReportDateRange({ period: '60d' }, now)).toEqual({
      from: '2026-04-06',
      to: '2026-06-04',
    })
    expect(resolveGuideVehicleReportDateRange({ period: '180d' }, now)).toEqual({
      from: '2025-12-07',
      to: '2026-06-04',
    })
    expect(buildGuideVehicleReportsUrl('30d')).toBe('/guide/vehicle-reports?period=30d')
    expect(buildGuideVehicleReportsUrl('60d')).toBe('/guide/vehicle-reports?period=60d')
    expect(buildGuideVehicleReportsUrl('180d')).toBe('/guide/vehicle-reports?period=180d')
  })

  it('falls back to 최근 7일 for invalid period', () => {
    expect(parseGuideVehicleReportPeriod('90d')).toBe('7d')
    expect(parseGuideVehicleReportPeriod('custom')).toBe('7d')
    expect(resolveGuideVehicleReportDateRange({ period: 'bad' }, now)).toEqual({
      from: '2026-05-29',
      to: '2026-06-04',
    })
  })

  it('excludes reports outside the selected period by tour start_date', () => {
    const range7 = resolveGuideVehicleReportDateRange({ period: '7d' }, now)
    expect(tourStartDateInGuideVehicleReportRange('2026-05-29', range7)).toBe(true)
    expect(tourStartDateInGuideVehicleReportRange('2026-06-04', range7)).toBe(true)
    expect(tourStartDateInGuideVehicleReportRange('2026-05-28', range7)).toBe(false)
    expect(tourStartDateInGuideVehicleReportRange('2026-06-05', range7)).toBe(false)
  })

  it('includes assigned April tours when the extended period includes April', () => {
    const range180 = resolveGuideVehicleReportDateRange({ period: '180d' }, now)
    expect(tourStartDateInGuideVehicleReportRange('2026-04-01', range180)).toBe(true)
    expect(tourStartDateInGuideVehicleReportRange('2026-04-30', range180)).toBe(true)
  })

  it('still excludes tours outside the selected extended period', () => {
    const range180 = resolveGuideVehicleReportDateRange({ period: '180d' }, now)
    expect(tourStartDateInGuideVehicleReportRange('2025-12-06', range180)).toBe(false)
    expect(tourStartDateInGuideVehicleReportRange('2026-06-05', range180)).toBe(false)
  })

  it('exposes helper and empty-state copy', () => {
    expect(GUIDE_VEHICLE_REPORT_PERIOD_HELPER).toBe(
      '가이드 미확인 리포트는 기간과 관계없이 항상 표시됩니다. 확인 완료 내역은 선택한 기간으로 조회합니다.',
    )
    expect(GUIDE_VEHICLE_REPORT_EMPTY_MESSAGE).toBe(
      '확인할 차량 리포트가 없습니다.',
    )
  })
})

describe('filterGuideVehicleReportsByPeriod', () => {
  const range7 = resolveGuideVehicleReportDateRange({ period: '7d' }, now)

  it('always includes unchecked action-required reports outside the selected period', () => {
    const filtered = filterGuideVehicleReportsByPeriod(
      [
        { start_date: '2026-04-01', checked: false, tour_id: 'april-1' },
        { start_date: '2026-05-29', checked: false, tour_id: 'recent-1' },
      ],
      range7,
    )

    expect(filtered.map((r) => r.tour_id)).toEqual(['april-1', 'recent-1'])
  })

  it('filters checked history by the selected period', () => {
    const filtered = filterGuideVehicleReportsByPeriod(
      [
        { start_date: '2026-04-01', checked: true, tour_id: 'old-checked' },
        { start_date: '2026-05-29', checked: true, tour_id: 'recent-checked' },
      ],
      range7,
    )

    expect(filtered.map((r) => r.tour_id)).toEqual(['recent-checked'])
  })

  it('keeps recent 7/30/60/180 options working for checked history', () => {
    const aprilChecked = { start_date: '2026-04-15', checked: true, tour_id: 'april' }
    expect(filterGuideVehicleReportsByPeriod([aprilChecked], range7)).toHaveLength(0)
    expect(
      filterGuideVehicleReportsByPeriod(
        [aprilChecked],
        resolveGuideVehicleReportDateRange({ period: '180d' }, now),
      ),
    ).toHaveLength(1)
  })
})

describe('guide vehicle report list page wiring', () => {
  const listPage = readFileSync(join(ROOT, 'src/app/guide/vehicle-reports/page.tsx'), 'utf8')
  const filter = readFileSync(
    join(ROOT, 'src/app/guide/vehicle-reports/GuideVehicleReportPeriodFilter.tsx'),
    'utf8',
  )
  const actions = readFileSync(join(ROOT, 'src/lib/actions/vehicleGuideActions.ts'), 'utf8')

  it('keeps guide vehicle reports list loading UI visible while page loads', () => {
    const loading = readFileSync(join(ROOT, 'src/app/guide/vehicle-reports/loading.tsx'), 'utf8')

    expect(loading).toContain('차량 리포트 확인 불러오는 중')
    expect(loading).toContain('bg-[#FCFAF7]')
    expect(loading).toContain('animate-pulse')
  })

  it('wires period filter without reset or custom date inputs', () => {
    expect(listPage).toContain('GuideVehicleReportPeriodFilter')
    expect(listPage).toContain('parseGuideVehicleReportPeriod')
    expect(listPage).toContain('GUIDE_VEHICLE_REPORT_EMPTY_MESSAGE')
    expect(listPage).toContain('getGuideVehicleReports({ period })')
    expect(listPage).not.toContain('초기화')
    expect(filter).not.toContain('초기화')
    expect(filter).not.toContain('type="date"')
    expect(filter).not.toContain('직접 설정')
    expect(filter).not.toContain('이번 달')
    expect(filter).not.toContain('지난 달')
    expect(filter).toContain('GUIDE_VEHICLE_REPORT_PERIODS')
    expect(filter).not.toContain('type="date"')
  })

  it('loads assigned tours without date bounds and applies period only to checked history', () => {
    const start = actions.indexOf('export async function getGuideVehicleReports')
    const end = actions.indexOf('export async function getGuideVehicleReportDetail', start)
    const body = actions.slice(start, end)

    expect(body).toContain('resolveGuideVehicleReportDateRange')
    expect(body).toContain('filterGuideVehicleReportsByPeriod')
    expect(body).toMatch(/\.from\(['"]tours['"]\)/)
    expect(body).toMatch(/\.eq\(['"]guide_id['"],\s*ctx\.guideId\)/)
    expect(body).toMatch(/\.neq\(['"]assignment_status['"],\s*['"]recalled['"]\)/)
    expect(body).not.toMatch(/\.gte\(['"]start_date['"],\s*range\.from\)/)
    expect(body).not.toMatch(/\.lte\(['"]start_date['"],\s*range\.to\)/)
    expect(body).toMatch(/\.from\(['"]vehicle_route_reports['"]\)/)
    expect(body).toMatch(/\.in\(['"]tour_id['"],\s*eligibleTourIds\)/)
    expect(body.indexOf(".from('tours')")).toBeLessThan(body.indexOf(".from('vehicle_route_reports')"))
    expect(body).not.toContain('.limit(200)')
    expect(body).not.toContain('.delete(')
  })

  it('keeps guide ownership restriction while supporting the extended period', () => {
    const start = actions.indexOf('export async function getGuideVehicleReports')
    const end = actions.indexOf('export async function getGuideVehicleReportDetail', start)
    const body = actions.slice(start, end)

    expect(parseGuideVehicleReportPeriod('180d')).toBe('180d')
    expect(body).toContain('resolveGuideVehicleReportDateRange')
    expect(body).toMatch(/\.eq\(['"]guide_id['"],\s*ctx\.guideId\)/)
    expect(body).toMatch(/\.eq\(['"]status['"],\s*['"]submitted['"]\)/)
  })

  it('returns early when the guide has no assigned tours', () => {
    const start = actions.indexOf('export async function getGuideVehicleReports')
    const end = actions.indexOf('export async function getGuideVehicleReportDetail', start)
    const body = actions.slice(start, end)

    expect(body).toContain('if (eligibleTourIds.length === 0) return []')
  })
})

describe('guide vehicle report period filter — scope guards', () => {
  const adminActions = readFileSync(
    join(ROOT, 'src/lib/actions/vehicleCompanyAdminActions.ts'),
    'utf8',
  )
  const vehicleActions = readFileSync(join(ROOT, 'src/lib/actions/vehicleReportActions.ts'), 'utf8')
  const adminAssignPage = readFileSync(
    join(ROOT, 'src/app/admin/vehicle-assignments/page.tsx'),
    'utf8',
  )
  const vehiclePage = readFileSync(join(ROOT, 'src/app/vehicle/page.tsx'), 'utf8')

  it('does not apply guide period limit to admin vehicle report history', () => {
    expect(adminActions).not.toContain('guide-vehicle-report-list')
    expect(adminActions).not.toContain('resolveGuideVehicleReportDateRange')
    expect(adminActions).not.toContain('tourStartDateInGuideVehicleReportRange')
    expect(adminAssignPage).not.toContain('guide-vehicle-report-list')
    expect(adminAssignPage).not.toContain('GUIDE_VEHICLE_REPORT_PERIODS')
  })

  it('does not apply guide period limit to vehicle company report history', () => {
    expect(vehicleActions).not.toContain('guide-vehicle-report-list')
    expect(vehicleActions).not.toContain('resolveGuideVehicleReportDateRange')
    expect(vehicleActions).not.toContain('tourStartDateInGuideVehicleReportRange')
    expect(vehiclePage).not.toContain('guide-vehicle-report-list')
    expect(vehiclePage).not.toContain('GUIDE_VEHICLE_REPORT_PERIODS')
    expect(vehiclePage).toContain('getVehicleCompanyAssignedTours')
  })
})
