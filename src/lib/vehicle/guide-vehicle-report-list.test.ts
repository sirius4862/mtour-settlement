import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  GUIDE_VEHICLE_REPORT_CHECKED_IDS_DB_EXCLUDE_MAX,
  GUIDE_VEHICLE_REPORT_EMPTY_MESSAGE,
  GUIDE_VEHICLE_REPORT_LIST_SELECT,
  GUIDE_VEHICLE_REPORT_PERIOD_HELPER,
  buildGuideVehicleReportsUrl,
  filterGuideVehicleReportsByPeriod,
  filterUncheckedReportRows,
  parseGuideVehicleReportPeriod,
  resolveGuideVehicleReportDateRange,
  shouldExcludeCheckedReportIdsInDb,
  sortGuideVehicleReportListItems,
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

describe('guide vehicle report list query helpers', () => {
  it('shows in-range reports via period filter', () => {
    const range7 = resolveGuideVehicleReportDateRange({ period: '7d' }, now)
    const items = filterGuideVehicleReportsByPeriod(
      [
        { start_date: '2026-05-29', checked: true, tour_id: 'in-range' },
        { start_date: '2026-04-01', checked: true, tour_id: 'out-range' },
      ],
      range7,
    )
    expect(items.map((r) => r.tour_id)).toEqual(['in-range'])
  })

  it('shows out-of-range unchecked reports regardless of period', () => {
    const range7 = resolveGuideVehicleReportDateRange({ period: '7d' }, now)
    const items = filterGuideVehicleReportsByPeriod(
      [{ start_date: '2026-04-01', checked: false, tour_id: 'old-unchecked' }],
      range7,
    )
    expect(items).toHaveLength(1)
  })

  it('hides out-of-range already checked reports', () => {
    const range7 = resolveGuideVehicleReportDateRange({ period: '7d' }, now)
    const items = filterGuideVehicleReportsByPeriod(
      [{ start_date: '2026-04-01', checked: true, tour_id: 'old-checked' }],
      range7,
    )
    expect(items).toHaveLength(0)
  })

  it('filters unchecked rows when checked ids are known', () => {
    const rows = [
      { id: 'r1', tour_id: 't1' },
      { id: 'r2', tour_id: 't2' },
    ]
    expect(filterUncheckedReportRows(rows, new Set(['r1']))).toEqual([{ id: 'r2', tour_id: 't2' }])
    expect(filterUncheckedReportRows(rows, new Set())).toEqual(rows)
  })

  it('does not use DB exclude for empty checked ids', () => {
    expect(shouldExcludeCheckedReportIdsInDb(0)).toBe(false)
  })

  it('uses DB exclude only for reasonably small checked id sets', () => {
    expect(shouldExcludeCheckedReportIdsInDb(1)).toBe(true)
    expect(shouldExcludeCheckedReportIdsInDb(GUIDE_VEHICLE_REPORT_CHECKED_IDS_DB_EXCLUDE_MAX)).toBe(
      true,
    )
    expect(
      shouldExcludeCheckedReportIdsInDb(GUIDE_VEHICLE_REPORT_CHECKED_IDS_DB_EXCLUDE_MAX + 1),
    ).toBe(false)
  })

  it('keeps unchecked-first then start_date sorting', () => {
    const sorted = sortGuideVehicleReportListItems([
      { checked: true, start_date: '2026-06-01', tour_id: 'a' },
      { checked: false, start_date: '2026-05-29', tour_id: 'b' },
      { checked: false, start_date: '2026-06-02', tour_id: 'c' },
    ])
    expect(sorted.map((r) => r.tour_id)).toEqual(['b', 'c', 'a'])
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

  it('loads in-range and out-of-range tours with DB date bounds', () => {
    const start = actions.indexOf('export async function getGuideVehicleReports')
    const end = actions.indexOf('export async function getGuideVehicleReportDetail', start)
    const body = actions.slice(start, end)

    expect(body).toContain('fetchInRangeTourIds')
    expect(body).toContain('fetchOutOfRangeTourIds')
    expect(body).toContain('fetchGuideCheckedReportIds')
    expect(actions).toMatch(/fetchInRangeTourIds[\s\S]*?\.gte\(['"]start_date['"],\s*range\.from\)/)
    expect(actions).toMatch(/fetchInRangeTourIds[\s\S]*?\.lte\(['"]start_date['"],\s*range\.to\)/)
    expect(actions).toContain('start_date.is.null')
    expect(actions).toMatch(/baseGuideToursQuery[\s\S]*?\.eq\(['"]guide_id['"],\s*guideId\)/)
    expect(actions).toMatch(/baseGuideToursQuery[\s\S]*?\.neq\(['"]assignment_status['"],\s*['"]recalled['"]\)/)
    expect(body).toContain('Promise.all')
    expect(body).toContain('excludeCheckedReportIds')
    expect(actions).toContain('shouldExcludeCheckedReportIdsInDb')
    expect(actions).toContain('filterUncheckedReportRows')
    expect(body).not.toContain('.limit(200)')
    expect(body).not.toContain('.delete(')
  })

  it('uses slim list select without heavy report body fields', () => {
    const listStart = actions.indexOf('async function fetchSubmittedReportsForTours')
    const listEnd = actions.indexOf('function toGuideVehicleReportListItem', listStart)
    const listBody = actions.slice(listStart, listEnd)

    const detailConstStart = actions.indexOf('const REPORT_DETAIL_SELECT')
    const detailConstEnd = actions.indexOf('function guideName', detailConstStart)
    const detailConstBody = actions.slice(detailConstStart, detailConstEnd)

    const detailStart = actions.indexOf('export async function getGuideVehicleReportDetail')
    const detailEnd = actions.indexOf('export async function submitGuideVehicleReportCheck', detailStart)
    const detailBody = actions.slice(detailStart, detailEnd)

    expect(listBody).toContain('GUIDE_VEHICLE_REPORT_LIST_SELECT')
    expect(listBody).not.toContain('daily_routes')
    expect(listBody).not.toContain('special_notes')
    expect(listBody).not.toContain('REPORT_DETAIL_SELECT')
    expect(detailBody).toContain('REPORT_DETAIL_SELECT')
    expect(detailConstBody).toContain('daily_routes')
    expect(GUIDE_VEHICLE_REPORT_LIST_SELECT).toContain('tour_code')
    expect(GUIDE_VEHICLE_REPORT_LIST_SELECT).not.toContain('daily_routes')
  })

  it('dedupes auth via cached getSession and keeps guide scoping', () => {
    const ctxStart = actions.indexOf('async function getGuideCtx')
    const ctxEnd = actions.indexOf('async function fetchSubmittedReportsForTours', ctxStart)
    const ctxBody = actions.slice(ctxStart, ctxEnd)

    const listStart = actions.indexOf('export async function getGuideVehicleReports')
    const listEnd = actions.indexOf('export async function getGuideVehicleReportDetail', listStart)
    const listBody = actions.slice(listStart, listEnd)

    expect(ctxBody).toContain('getSession()')
    expect(ctxBody).toContain('isGuide(session.role')
    expect(ctxBody).not.toContain('auth.getUser()')
    expect(actions).toMatch(/baseGuideToursQuery[\s\S]*?\.eq\(['"]guide_id['"],\s*guideId\)/)
  })

  it('drops checked out-of-range reports before final period filter', () => {
    const start = actions.indexOf('export async function getGuideVehicleReports')
    const end = actions.indexOf('export async function getGuideVehicleReportDetail', start)
    const body = actions.slice(start, end)

    expect(body).toContain('outRangeUncheckedReports')
    expect(body).toContain('excludeCheckedReportIds')
    expect(body).toContain('filterGuideVehicleReportsByPeriod')
    expect(body).toContain('sortGuideVehicleReportListItems')
  })

  it('keeps guide ownership restriction while supporting the extended period', () => {
    const start = actions.indexOf('export async function getGuideVehicleReports')
    const end = actions.indexOf('export async function getGuideVehicleReportDetail', start)
    const body = actions.slice(start, end)

    expect(parseGuideVehicleReportPeriod('180d')).toBe('180d')
    expect(body).toContain('resolveGuideVehicleReportDateRange')
    expect(actions).toMatch(/baseGuideToursQuery[\s\S]*?\.eq\(['"]guide_id['"],\s*guideId\)/)
    expect(actions).toMatch(/fetchSubmittedReportsForTours[\s\S]*?\.eq\(['"]status['"],\s*['"]submitted['"]\)/)
  })

  it('returns early when the guide has no in-range or out-of-range tours', () => {
    const start = actions.indexOf('export async function getGuideVehicleReports')
    const end = actions.indexOf('export async function getGuideVehicleReportDetail', start)
    const body = actions.slice(start, end)

    expect(body).toContain(
      'if (inRangeTourIds.length === 0 && outRangeTourIds.length === 0) return []',
    )
  })

  it('does not use invalid in() when checked ids are empty', () => {
    expect(actions).toContain('shouldExcludeCheckedReportIdsInDb')
    expect(actions).toContain("if (tourIds.length === 0) return []")
    const fetchStart = actions.indexOf('async function fetchSubmittedReportsForTours')
    const fetchEnd = actions.indexOf('function toGuideVehicleReportListItem', fetchStart)
    const fetchBody = actions.slice(fetchStart, fetchEnd)
    expect(fetchBody).toContain('if (exclude && shouldExcludeCheckedReportIdsInDb(exclude.size))')
  })

  it('keeps settlement save files untouched by this optimization', () => {
    const settlementActions = readFileSync(
      join(ROOT, 'src/lib/actions/settlementActions.ts'),
      'utf8',
    )
    const settlementForm = readFileSync(
      join(ROOT, 'src/components/settlement/SettlementForm.tsx'),
      'utf8',
    )
    expect(settlementActions).toContain('saveSettlementDraft')
    expect(settlementForm).toContain('saveInFlightRef')
    expect(actions).not.toContain('saveSettlementDraft')
    expect(actions).not.toContain('saveInFlightRef')
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
