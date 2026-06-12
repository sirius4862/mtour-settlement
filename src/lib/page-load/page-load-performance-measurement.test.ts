import { describe, expect, it } from 'vitest'
import {
  buildPageLoadReport,
  buildPageLoadRouteList,
  buildPageLoadRunWarnings,
  PAGE_LOAD_ROUTE_DEFS,
  PAGE_LOAD_WARNING_THRESHOLDS,
  parseRouteFilter,
  percentile,
  redactSecrets,
  redactUnknown,
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
    expect(ids).toContain('vehicle-report-detail')
    expect(routes.find((r) => r.id === 'guide-settlement-edit')?.path).toBe(
      '/guide/settlements/abc/edit',
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
    expect(PAGE_LOAD_ROUTE_DEFS.some((d) => d.dynamic)).toBe(true)
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
