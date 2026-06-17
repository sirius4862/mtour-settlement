import { describe, expect, it } from 'vitest'
import {
  buildPageLoadReport,
  buildPageLoadRouteList,
  buildPageLoadRunWarnings,
  classifyRouteFilter,
  isGuideEditMeasurementEnabled,
  PAGE_LOAD_ROUTE_DEFS,
  PAGE_LOAD_WARNING_THRESHOLDS,
  parseRouteFilter,
  percentile,
  redactSecrets,
  redactUnknown,
  resolveGroupsInScope,
  resolveMeasurementCredentials,
  routeMatchesFilter,
  summarizeNumeric,
} from '../../../scripts/lib/page-load-performance-summary.mjs'

describe('page-load route list generation', () => {
  it('includes all static routes by default with dynamic paths resolved', () => {
    const routes = buildPageLoadRouteList({
      guideEditPath: '/guide/settlements/abc/edit',
      adminDetailPath: '/admin/settlements/abc',
      vehicleReportPath: '/vehicle/reports/tour-1',
    })
    const ids = routes.map((r) => r.id)
    expect(ids).toContain('guide-dashboard')
    expect(ids).toContain('guide-settlement-edit')
    expect(ids).toContain('admin-settlement-detail')
    expect(ids).toContain('admin-settlement-edit')
    expect(ids).toContain('vehicle-report-detail')
    expect(routes.find((r) => r.id === 'guide-settlement-edit')?.path).toBe(
      '/guide/settlements/abc/edit',
    )
    expect(routes.find((r) => r.id === 'admin-settlement-edit')?.path).toBe(
      '/admin/settlements/abc/edit',
    )
  })

  it('filters routes by PERF_ROUTE_FILTER groups', () => {
    const guideOnly = buildPageLoadRouteList({
      routeFilter: 'guide',
      guideEditPath: '/guide/settlements/abc/edit',
    })
    expect(guideOnly.every((r) => r.group === 'guide')).toBe(true)
    expect(guideOnly.some((r) => r.id === 'admin-dashboard')).toBe(false)

    const filter = parseRouteFilter('guide,admin')
    expect(filter?.has('guide')).toBe(true)
    expect(filter?.has('vehicle')).toBe(false)
  })

  it('skips dynamic routes when override path is missing', () => {
    const routes = buildPageLoadRouteList({ routeFilter: 'admin' })
    expect(routes.map((r) => r.id)).not.toContain('admin-settlement-detail')
    expect(routes.map((r) => r.id)).not.toContain('admin-settlement-edit')
    expect(PAGE_LOAD_ROUTE_DEFS.some((d) => d.dynamic)).toBe(true)
  })

  it('derives admin-settlement-edit from admin detail path when edit override omitted', () => {
    const routes = buildPageLoadRouteList({
      routeFilter: 'admin-settlement-detail,admin-settlement-edit',
      adminDetailPath: '/admin/settlements/abc',
    })
    expect(routes.map((r) => r.id)).toEqual(['admin-settlement-detail', 'admin-settlement-edit'])
    expect(routes.find((r) => r.id === 'admin-settlement-edit')?.path).toBe(
      '/admin/settlements/abc/edit',
    )
  })

  it('skips guide-settlement-edit when guide edit path is unset or skip', () => {
    expect(isGuideEditMeasurementEnabled(undefined)).toBe(false)
    expect(isGuideEditMeasurementEnabled('')).toBe(false)
    expect(isGuideEditMeasurementEnabled('skip')).toBe(false)
    expect(isGuideEditMeasurementEnabled('SKIP')).toBe(false)
    expect(isGuideEditMeasurementEnabled('/guide/settlements/abc/edit')).toBe(true)

    const withoutEdit = buildPageLoadRouteList({ routeFilter: 'guide' })
    expect(withoutEdit.map((r) => r.id)).not.toContain('guide-settlement-edit')
    expect(withoutEdit.map((r) => r.id)).toContain('guide-vehicle-reports')

    const withEdit = buildPageLoadRouteList({
      routeFilter: 'guide',
      guideEditPath: '/guide/settlements/abc/edit',
    })
    expect(withEdit.map((r) => r.id)).toContain('guide-settlement-edit')
  })

  it('filters routes by route id tokens', () => {
    const vehicleOnly = buildPageLoadRouteList({ routeFilter: 'guide-vehicle-reports' })
    expect(vehicleOnly.map((r) => r.id)).toEqual(['guide-vehicle-reports'])

    const dashboardOnly = buildPageLoadRouteList({ routeFilter: 'guide-dashboard' })
    expect(dashboardOnly.map((r) => r.id)).toEqual(['guide-dashboard'])
  })

  it('route id filter derives guide credentials scope', () => {
    const plan = resolveMeasurementCredentials({
      routeFilter: 'guide-vehicle-reports',
      env: {
        PERF_GUIDE_EMAIL: 'guide@test.com',
        PERF_GUIDE_PASSWORD: 'guide-pass',
      },
    })
    expect(plan.rolesToLogin).toEqual(['guide'])
    expect(resolveGroupsInScope('guide-vehicle-reports')).toEqual(new Set(['guide']))
  })

  it('classifies mixed route id and group tokens', () => {
    const classified = classifyRouteFilter('guide-dashboard,admin')
    const guideDashboard = PAGE_LOAD_ROUTE_DEFS.find((d) => d.id === 'guide-dashboard')!
    const adminDashboard = PAGE_LOAD_ROUTE_DEFS.find((d) => d.id === 'admin-dashboard')!
    const guideVehicleReports = PAGE_LOAD_ROUTE_DEFS.find((d) => d.id === 'guide-vehicle-reports')!
    expect(classified.routeIds?.has('guide-dashboard')).toBe(true)
    expect(classified.groups?.has('admin')).toBe(true)
    expect(routeMatchesFilter(guideDashboard, classified)).toBe(true)
    expect(routeMatchesFilter(adminDashboard, classified)).toBe(true)
    expect(routeMatchesFilter(guideVehicleReports, classified)).toBe(false)
  })
})

describe('page-load credential requirements by route filter', () => {
  const guideEnv = {
    PERF_GUIDE_EMAIL: 'guide@test.com',
    PERF_GUIDE_PASSWORD: 'guide-pass',
  }
  const adminEnv = {
    PERF_ADMIN_EMAIL: 'admin@test.com',
    PERF_ADMIN_PASSWORD: 'admin-pass',
  }
  const vehicleEnv = {
    PERF_VEHICLE_EMAIL: 'vehicle@test.com',
    PERF_VEHICLE_PASSWORD: 'vehicle-pass',
  }

  it('guide-only route filter requires only guide credentials', () => {
    const plan = resolveMeasurementCredentials({
      routeFilter: 'guide',
      env: guideEnv,
    })
    expect(plan.rolesToLogin).toEqual(['guide'])
    expect(plan.skippedRoles).toEqual([])
    expect(plan.warnings).toEqual([])
    expect(resolveGroupsInScope('guide')).toEqual(new Set(['guide']))
  })

  it('admin-only route filter requires only admin credentials', () => {
    const plan = resolveMeasurementCredentials({
      routeFilter: 'admin',
      env: adminEnv,
    })
    expect(plan.rolesToLogin).toEqual(['admin'])
    expect(plan.skippedRoles).toEqual([])
  })

  it('vehicle-only route filter requires only vehicle credentials', () => {
    const plan = resolveMeasurementCredentials({
      routeFilter: 'vehicle',
      env: vehicleEnv,
    })
    expect(plan.rolesToLogin).toEqual(['vehicle'])
    expect(plan.skippedRoles).toEqual([])
  })

  it('guide,admin route filter requires guide and admin credentials only', () => {
    const plan = resolveMeasurementCredentials({
      routeFilter: 'guide,admin',
      env: { ...guideEnv, ...adminEnv },
    })
    expect(plan.rolesToLogin).toEqual(['guide', 'admin'])
    expect(plan.rolesToLogin).not.toContain('vehicle')
  })

  it('guide-only filter does not require admin or vehicle env', () => {
    expect(() =>
      resolveMeasurementCredentials({
        routeFilter: 'guide',
        env: guideEnv,
      }),
    ).not.toThrow()
  })

  it('explicit filter throws when required role credentials are missing', () => {
    expect(() =>
      resolveMeasurementCredentials({
        routeFilter: 'guide',
        env: {},
      }),
    ).toThrow('Missing required env: PERF_GUIDE_EMAIL')

    expect(() =>
      resolveMeasurementCredentials({
        routeFilter: 'admin',
        env: guideEnv,
      }),
    ).toThrow('Missing required env: PERF_ADMIN_EMAIL')
  })

  it('no route filter skips roles with missing credentials and warns', () => {
    const plan = resolveMeasurementCredentials({
      routeFilter: null,
      env: guideEnv,
    })
    expect(plan.explicitFilter).toBe(false)
    expect(plan.rolesToLogin).toEqual(['guide'])
    expect(plan.skippedRoles.map((s) => s.role)).toEqual(['admin', 'vehicle'])
    expect(plan.warnings).toEqual([
      'Skipping admin routes: credentials not configured',
      'Skipping vehicle routes: credentials not configured',
    ])
  })

  it('no route filter measures all roles when all credentials are present', () => {
    const plan = resolveMeasurementCredentials({
      routeFilter: null,
      env: { ...guideEnv, ...adminEnv, ...vehicleEnv },
    })
    expect(plan.rolesToLogin).toEqual(['guide', 'admin', 'vehicle'])
    expect(plan.skippedRoles).toEqual([])
    expect(plan.warnings).toEqual([])
  })
})

describe('page-load summary statistics', () => {
  it('computes avg/min/max/p50', () => {
    expect(summarizeNumeric([1000, 2000, 3000])).toEqual({
      count: 3,
      avg: 2000,
      min: 1000,
      max: 3000,
      p50: 2000,
    })
    expect(percentile([10, 20, 30, 40], 50)).toBe(25)
  })
})

describe('page-load warning flags', () => {
  it('flags threshold breaches and console errors', () => {
    const { warnings, flags } = buildPageLoadRunWarnings({
      routeId: 'guide-dashboard',
      path: '/guide',
      pageReadyMs: PAGE_LOAD_WARNING_THRESHOLDS.pageReadyMs + 1,
      domContentLoadedMs: PAGE_LOAD_WARNING_THRESHOLDS.domContentLoadedMs + 1,
      networkIdleMs: PAGE_LOAD_WARNING_THRESHOLDS.networkIdleMs + 1,
      httpStatus: 500,
      consoleErrors: ['boom'],
      finalPath: '/guide/settlements',
    })
    expect(flags.pageReadyOver5000).toBe(true)
    expect(flags.domContentLoadedOver3000).toBe(true)
    expect(flags.networkIdleOver7000).toBe(true)
    expect(flags.httpStatusNot200).toBe(true)
    expect(flags.consoleError).toBe(true)
    expect(flags.unexpectedRedirect).toBe(true)
    expect(warnings.length).toBeGreaterThanOrEqual(5)
  })
})

describe('page-load secret redaction', () => {
  it('redacts passwords and tokens from strings and objects', () => {
    const raw =
      'PERF_GUIDE_PASSWORD=secret123 token: eyJhbGciOiJIUzI1NiJ9.abc.def'
    expect(redactSecrets(raw)).not.toContain('secret123')
    expect(redactSecrets(raw)).toContain('[REDACTED]')

    const obj = redactUnknown({
      password: 'x',
      nested: { access_token: 'tok' },
      message: 'PERF_ADMIN_PASSWORD=abc',
    })
    expect(obj.password).toBe('[REDACTED]')
    expect(obj.nested.access_token).toBe('[REDACTED]')
  })
})

describe('page-load report output shape', () => {
  it('builds routes summary, ranking, and aggregate warnings', () => {
    const report = buildPageLoadReport(
      [
        {
          run: 1,
          routeId: 'guide-dashboard',
          role: 'guide',
          path: '/guide',
          label: 'Guide dashboard',
          ok: true,
          pageReadyMs: 4200,
          mainContentMs: 3800,
          domContentLoadedMs: 1200,
          loadMs: 2500,
          networkIdleMs: 4100,
          httpStatus: 200,
          consoleErrors: [],
        },
        {
          run: 2,
          routeId: 'guide-dashboard',
          role: 'guide',
          path: '/guide',
          label: 'Guide dashboard',
          ok: true,
          pageReadyMs: 6100,
          mainContentMs: 5900,
          domContentLoadedMs: 3100,
          loadMs: 4000,
          networkIdleMs: 7200,
          httpStatus: 200,
          consoleErrors: ['error'],
        },
        {
          run: 1,
          routeId: 'admin-dashboard',
          role: 'admin',
          path: '/admin',
          label: 'Admin dashboard',
          ok: true,
          pageReadyMs: 3000,
          mainContentMs: 2800,
          domContentLoadedMs: 900,
          loadMs: 1800,
          networkIdleMs: 2900,
          httpStatus: 200,
          consoleErrors: [],
        },
      ],
      {
        baseUrl: 'https://example.test',
        runCount: 2,
        measuredAt: '2026-06-12T00:00:00.000Z',
      },
    )

    expect(report.meta.baseUrl).toBe('https://example.test')
    expect(report.routes).toHaveLength(2)
    expect(report.routes[0].summary.pageReadyMs.p50).toBeDefined()
    expect(report.slowestRoutes[0].routeId).toBe('guide-dashboard')
    expect(report.warningFlags.pageReadyOver5000).toBe(true)
    expect(report.warningFlags.consoleError).toBe(true)
    expect(report.warnings.length).toBeGreaterThan(0)
    expect(report.runs[0].consoleErrors).toEqual([])
  })
})
