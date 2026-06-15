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
 * @param {import('playwright').Page} page
 * @param {string} baseUrl
 * @param {ReturnType<typeof buildPageLoadRouteList>[number]} route
 */
async function measureRouteOnce(page, baseUrl, route) {
  const url = `${baseUrl}${route.path}`
  const consoleErrors = []

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
    const finalPath = new URL(page.url()).pathname

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
      consoleErrors,
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: redactSecrets(error),
      httpStatus: response?.status(),
      pageReadyMs: Date.now() - started,
      consoleErrors,
      finalPath: page.url() ? new URL(page.url()).pathname : undefined,
    }
  } finally {
    page.off('console', onConsole)
  }
}

async function main() {
  loadEnvLocal()

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
  const guideEditPath =
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
        (await discoverFirstHref(page, baseUrl, '/admin/settlements', /^\/admin\/settlements\/[^/]+$/)) ??
        ''
      await ctx.close()
      if (!adminDetailPath) {
        skippedRoutes.push({
          id: 'admin-settlement-detail',
          reason: 'no admin settlement link found; set PERF_ADMIN_SETTLEMENT_DETAIL_URL',
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
          `[measure-page-load] ${route.id} run ${run}/${runCount} pageReadyMs=${result.pageReadyMs ?? 'n/a'}\n`,
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
