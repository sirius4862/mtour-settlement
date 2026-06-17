#!/usr/bin/env node
/**
 * Safe page-load performance measurement (read-only navigation).
 * Logs in per role, visits routes, measures timing — no writes or workflow actions.
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  buildPageLoadReport,
  buildPageLoadRouteList,
  PAGE_LOAD_ROLE_ENV,
  PAGE_LOAD_ROUTE_DEFS,
  pickSlowestNetworkRequest,
  redactSecrets,
  resolveGroupsInScope,
  resolveMeasurementCredentials,
} from './lib/page-load-performance-summary.mjs'

function loadEnvLocal() {
  const p = join(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
}

function mapWorkflowCredentialsToPerf() {
  const pairs = [
    ['PERF_GUIDE_EMAIL', 'WORKFLOW_TEST_GUIDE_EMAIL'],
    ['PERF_GUIDE_PASSWORD', 'WORKFLOW_TEST_GUIDE_PASSWORD'],
    ['PERF_ADMIN_EMAIL', 'WORKFLOW_TEST_ADMIN_EMAIL'],
    ['PERF_ADMIN_PASSWORD', 'WORKFLOW_TEST_ADMIN_PASSWORD'],
    ['PERF_VEHICLE_EMAIL', 'WORKFLOW_TEST_VEHICLE_EMAIL'],
    ['PERF_VEHICLE_PASSWORD', 'WORKFLOW_TEST_VEHICLE_PASSWORD'],
  ]
  for (const [perfKey, workflowKey] of pairs) {
    if (!process.env[perfKey]?.trim() && process.env[workflowKey]?.trim()) {
      process.env[perfKey] = process.env[workflowKey].trim()
    }
  }
}

function req(name) {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`Missing required env: ${name}`)
  return v
}

function opt(name, fallback = '') {
  return process.env[name]?.trim() || fallback
}

function parseRuns() {
  const raw = opt('PERF_RUNS', '3')
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`PERF_RUNS must be a positive integer, got "${raw}"`)
  }
  return n
}

function normalizePath(path) {
  if (!path) return path
  return path.startsWith('/') ? path : `/${path}`
}

async function loginRole(page, baseUrl, role) {
  const { email: emailKey, password: passwordKey } = PAGE_LOAD_ROLE_ENV[role]
  const email = req(emailKey)
  const password = req(passwordKey)

  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  const emailField = page.getByRole('textbox', { name: 'Email' })
  await emailField.waitFor({ state: 'visible', timeout: 30_000 })
  await emailField.fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Login' }).click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60_000 })
}

/**
 * @param {import('playwright').Page} page
 * @param {string} baseUrl
 * @param {string} listPath
 * @param {RegExp} hrefPattern
 */
async function discoverFirstHref(page, baseUrl, listPath, hrefPattern) {
  await page.goto(`${baseUrl}${listPath}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
  const count = await page.locator('a[href]').count()
  for (let i = 0; i < Math.min(count, 40); i += 1) {
    const href = await page.locator('a[href]').nth(i).getAttribute('href')
    if (href && hrefPattern.test(href)) {
      return normalizePath(href.split('?')[0])
    }
  }
  return null
}

/**
 * @returns {{
 *   reset: () => void
 *   detach: () => void
 *   snapshot: () => { requestCount: number; slowestRequest?: ReturnType<typeof pickSlowestNetworkRequest> }
 * }}
 */
function attachNetworkTelemetry(page) {
  /** @type {Map<import('playwright').Request, number>} */
  const requestStartedAt = new Map()
  /** @type {Array<{ url: string; status?: number; resourceType?: string; durationMs: number }>} */
  const records = []

  /** @param {import('playwright').Request} request */
  const onRequest = (request) => {
    requestStartedAt.set(request, Date.now())
  }

  /** @param {import('playwright').Response} response */
  const onResponse = (response) => {
    const request = response.request()
    const startedAt = requestStartedAt.get(request) ?? Date.now()
    requestStartedAt.delete(request)
    records.push({
      url: response.url(),
      status: response.status(),
      resourceType: request.resourceType(),
      durationMs: Date.now() - startedAt,
    })
  }

  page.on('request', onRequest)
  page.on('response', onResponse)

  return {
    reset() {
      requestStartedAt.clear()
      records.length = 0
    },
    detach() {
      page.off('request', onRequest)
      page.off('response', onResponse)
    },
    snapshot() {
      return {
        requestCount: records.length,
        slowestRequest: pickSlowestNetworkRequest(records),
      }
    },
  }
}

/**
 * @param {import('playwright').Page} page
 * @param {string} baseUrl
 * @param {ReturnType<typeof buildPageLoadRouteList>[number]} route
 */
async function measureRouteOnce(page, baseUrl, route) {
  const url = `${baseUrl}${route.path}`
  const consoleErrors = []
  const network = attachNetworkTelemetry(page)

  const onConsole = (msg) => {
    if (msg.type() === 'error') {
      const text = redactSecrets(msg.text())
      if (text && !text.includes('favicon')) {
        consoleErrors.push(text)
      }
    }
  }
  page.on('console', onConsole)

  const started = Date.now()
  let response = null
  let error

  try {
    network.reset()
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.getByText(route.contentMarker, { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 90_000,
    })
    const mainContentMs = Date.now() - started

    const perf = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0]
      if (!nav) return null
      return {
        domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
        loadMs: nav.loadEventEnd > 0 ? Math.round(nav.loadEventEnd) : undefined,
        redirectCount: nav.redirectCount ?? 0,
      }
    })

    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
    const networkIdleMs = Date.now() - started
    const pageReadyMs = Date.now() - started
    const finalUrl = page.url()
    const finalUrlObj = new URL(finalUrl)
    const finalPath = `${finalUrlObj.pathname}${finalUrlObj.search}`
    const { requestCount, slowestRequest } = network.snapshot()

    return {
      ok: true,
      httpStatus: response?.status(),
      redirectCount: perf?.redirectCount ?? 0,
      domContentLoadedMs: perf?.domContentLoadedMs,
      loadMs: perf?.loadMs,
      networkIdleMs,
      mainContentMs,
      pageReadyMs,
      finalPath,
      finalUrl: redactSecrets(finalUrl),
      requestCount,
      slowestRequest,
      consoleErrors,
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    const { requestCount, slowestRequest } = network.snapshot()
    return {
      ok: false,
      error: redactSecrets(error),
      httpStatus: response?.status(),
      pageReadyMs: Date.now() - started,
      requestCount,
      slowestRequest,
      consoleErrors,
      finalPath: page.url() ? new URL(page.url()).pathname + new URL(page.url()).search : undefined,
      finalUrl: page.url() ? redactSecrets(page.url()) : undefined,
    }
  } finally {
    page.off('console', onConsole)
    network.detach()
  }
}

async function main() {
  loadEnvLocal()
  mapWorkflowCredentialsToPerf()

  const baseUrl = opt('PERF_BASE_URL', 'https://mtour-settlement.vercel.app').replace(/\/$/, '')
  const runCount = parseRuns()
  const outputPath = opt('PERF_OUTPUT', './artifacts/page-load-performance.json')
  const routeFilter = opt('PERF_ROUTE_FILTER', '') || null

  const credentialPlan = resolveMeasurementCredentials({
    routeFilter,
    env: process.env,
  })
  const groupsInScope = resolveGroupsInScope(routeFilter)
  const rolesToLogin = new Set(credentialPlan.rolesToLogin)

  for (const warning of credentialPlan.warnings) {
    console.warn(`[measure-page-load] ${warning}`)
  }

  const guideEditPathRaw = opt('PERF_GUIDE_SETTLEMENT_EDIT_URL', '')
  let guideEditPath =
    guideEditPathRaw && guideEditPathRaw.toLowerCase() !== 'skip'
      ? normalizePath(guideEditPathRaw)
      : undefined
  let adminDetailPath = opt('PERF_ADMIN_SETTLEMENT_DETAIL_URL', '')
  let vehicleReportPath = opt('PERF_VEHICLE_REPORT_URL', '')

  const skippedRoutes = []

  const browser = await chromium.launch({ headless: true })
  const runs = []
  let rolesMeasured = []

  try {
    if (groupsInScope.has('admin') && rolesToLogin.has('admin') && !adminDetailPath) {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      await loginRole(page, baseUrl, 'admin')
      adminDetailPath =
        (await discoverFirstHref(
          page,
          baseUrl,
          '/admin/settlements?status=submitted',
          /^\/admin\/settlements\/[^/]+$/,
        )) ??
        (await discoverFirstHref(
          page,
          baseUrl,
          '/admin/settlements',
          /^\/admin\/settlements\/[^/]+$/,
        )) ??
        ''
      await ctx.close()
      if (!adminDetailPath) {
        skippedRoutes.push({
          id: 'admin-settlement-detail',
          reason: 'no admin settlement link found; set PERF_ADMIN_SETTLEMENT_DETAIL_URL',
        })
        skippedRoutes.push({
          id: 'admin-settlement-edit',
          reason: 'no admin settlement link found; set PERF_ADMIN_SETTLEMENT_DETAIL_URL',
        })
      }
    }

    if (groupsInScope.has('guide') && rolesToLogin.has('guide') && !guideEditPath) {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      await loginRole(page, baseUrl, 'guide')
      guideEditPath =
        (await discoverFirstHref(
          page,
          baseUrl,
          '/guide/settlements',
          /^\/guide\/settlements\/[^/]+\/edit$/,
        )) ?? ''
      await ctx.close()
      if (!guideEditPath) {
        skippedRoutes.push({
          id: 'guide-settlement-edit',
          reason: 'no guide editable settlement found; set PERF_GUIDE_SETTLEMENT_EDIT_URL',
        })
      }
    }

    if (groupsInScope.has('vehicle') && rolesToLogin.has('vehicle') && !vehicleReportPath) {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      await loginRole(page, baseUrl, 'vehicle')
      vehicleReportPath =
        (await discoverFirstHref(page, baseUrl, '/vehicle', /^\/vehicle\/reports\/[^/]+$/)) ?? ''
      await ctx.close()
      if (!vehicleReportPath) {
        skippedRoutes.push({
          id: 'vehicle-report-detail',
          reason: 'no vehicle report link found; set PERF_VEHICLE_REPORT_URL',
        })
      }
    }

    const routes = buildPageLoadRouteList({
      routeFilter,
      guideEditPath: normalizePath(guideEditPath),
      adminDetailPath: adminDetailPath ? normalizePath(adminDetailPath) : undefined,
      vehicleReportPath: vehicleReportPath ? normalizePath(vehicleReportPath) : undefined,
    }).filter((route) => rolesToLogin.has(route.role))

    if (!routes.length) {
      throw new Error('No routes to measure — check PERF_ROUTE_FILTER, credentials, and dynamic path env vars')
    }

    rolesMeasured = [...new Set(routes.map((r) => r.role))]
    const contexts = {}

    for (const role of rolesMeasured) {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      await loginRole(page, baseUrl, role)
      contexts[role] = { ctx, page }
    }

    for (const route of routes) {
      const { page } = contexts[route.role]
      for (let run = 1; run <= runCount; run += 1) {
        const result = await measureRouteOnce(page, baseUrl, route)
        runs.push({
          run,
          routeId: route.id,
          role: route.role,
          path: route.path,
          label: route.label,
          contentMarker: route.contentMarker,
          ...result,
        })
        process.stdout.write(
          `[measure-page-load] ${route.id} run ${run}/${runCount} pageReadyMs=${result.pageReadyMs ?? 'n/a'} requests=${result.requestCount ?? 'n/a'} slowest=${result.slowestRequest?.durationMs ?? 'n/a'}ms\n`,
        )
      }
    }

    for (const { ctx } of Object.values(contexts)) {
      await ctx.close()
    }
  } finally {
    await browser.close()
  }

  const report = buildPageLoadReport(runs, {
    baseUrl,
    runCount,
    measuredAt: new Date().toISOString(),
    routeFilter,
    skippedRoutes,
    skippedRoles: credentialPlan.skippedRoles,
    credentialWarnings: credentialPlan.warnings,
    rolesMeasured,
    routeCatalog: PAGE_LOAD_ROUTE_DEFS.map((d) => ({ id: d.id, role: d.role, label: d.label })),
  })

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  const slowest = report.slowestRoutes?.[0]
  console.log(`[measure-page-load] wrote ${outputPath}`)
  console.log(
    `[measure-page-load] routes=${report.routes.length} warnings=${report.warnings.length} slowest=${slowest?.routeId ?? 'n/a'} p50=${slowest?.p50PageReadyMs ?? 'n/a'}ms`,
  )
}

main().catch((err) => {
  console.error('[measure-page-load] failed:', redactSecrets(err instanceof Error ? err.message : String(err)))
  process.exit(1)
})
