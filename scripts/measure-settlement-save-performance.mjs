#!/usr/bin/env node
/**
 * Automated settlement draft-save performance measurement (guide credentials only).
 * Clicks 임시저장 only — never submit/pay/approve/reopen/recall.
 *
 * Requires SAVE_TIMING_DEBUG=1 on the target deployment for _debugTimings capture.
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  buildMeasurementReport,
  CHILD_COUNT_TABLES,
  isServerActionPostRequest,
  normalizeResponseTextForDebugParse,
  parseDebugTimingsFromConsoleText,
  parseDebugTimingsFromResponseText,
} from './lib/save-performance-summary.mjs'

const FORBIDDEN_BUTTONS = [
  '저장 후 제출',
  '가이드 검토 요청',
  '제출',
  '승인',
  '지급',
  '재오픈',
  '회수',
]

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
  if (!Number.isFinite(n) || n < 1) throw new Error(`PERF_RUNS must be a positive integer, got "${raw}"`)
  return n
}

function extractSettlementIdFromPath(pathname) {
  const m = pathname.match(/\/(?:guide|admin)\/settlements\/([^/]+)\/edit/)
  return m?.[1] ?? null
}

async function loginGuide(page, baseUrl, email, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  const emailField = page.getByRole('textbox', { name: 'Email' })
  await emailField.waitFor({ state: 'visible', timeout: 30_000 })
  await emailField.fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Login' }).click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60_000 })
}

async function resolveEditPath(page, baseUrl) {
  const direct = opt('PERF_SETTLEMENT_EDIT_URL')
  if (direct) {
    return direct.startsWith('/') ? direct : `/${direct}`
  }

  const tourCode = opt('PERF_TOUR_CODE')
  if (!tourCode) {
    throw new Error('Set PERF_SETTLEMENT_EDIT_URL or PERF_TOUR_CODE')
  }

  await page.goto(`${baseUrl}/guide/settlements?search=${encodeURIComponent(tourCode)}`, {
    waitUntil: 'domcontentloaded',
  })

  const card = page
    .locator('a')
    .filter({ has: page.locator('p.font-mono', { hasText: tourCode }) })
    .first()

  await card.waitFor({ state: 'visible', timeout: 30_000 })
  const href = await card.getAttribute('href')
  if (!href) throw new Error(`No settlement link found for tour code ${tourCode}`)
  if (!href.includes('/edit')) {
    throw new Error(
      `Settlement for ${tourCode} is not editable (href=${href}). Use a draft/edit_requested settlement.`,
    )
  }
  return href.startsWith('/') ? href : new URL(href).pathname
}

async function waitForFormReady(page) {
  const footer = page.locator('.fixed.bottom-16')
  await footer.getByRole('button', { name: '임시저장' }).waitFor({ state: 'visible', timeout: 60_000 })
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
}

function getSupabaseConfig() {
  const url = opt('PERF_SUPABASE_URL') || opt('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = opt('PERF_SUPABASE_ANON_KEY') || opt('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!url || !anonKey) return null
  return { url, anonKey }
}

async function createGuideSupabaseClient(email, password) {
  const cfg = getSupabaseConfig()
  if (!cfg) return null
  const client = createClient(cfg.url, cfg.anonKey)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) return null
  return client
}

async function countChildRows(client, settlementId) {
  const counts = {}
  for (const table of CHILD_COUNT_TABLES) {
    const { count, error } = await client
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('settlement_id', settlementId)
    counts[table] = error ? null : (count ?? 0)
  }
  return counts
}

async function assertNoForbiddenButtons(page) {
  const footer = page.locator('.fixed.bottom-16')
  for (const label of FORBIDDEN_BUTTONS) {
    const count = await footer.getByRole('button', { name: label }).count()
    if (count > 0) {
      // Visible but we will not click them — informational only.
    }
  }
}

function isSettlementSaveActionResponse(response) {
  const url = response.url()
  if (!url.includes('/guide/settlements') && !url.includes('/admin/settlements')) {
    return false
  }
  return isServerActionPostRequest(response.request())
}

function parseNetworkDebugTimingsFromResponseText(text) {
  return (
    parseDebugTimingsFromResponseText(text) ||
    parseDebugTimingsFromResponseText(normalizeResponseTextForDebugParse(text))
  )
}

async function performDraftSaveRun(page, runIndex) {
  const footer = page.locator('.fixed.bottom-16')
  const saveButton = footer.getByRole('button', { name: '임시저장' })

  let networkDebugTimings = null
  let consoleDebugTimings = null
  let saveResponseOk = true
  let saveError
  let sawDebugMarkerInNetwork = false
  let serverResponseMs

  const consoleHandler = (msg) => {
    const text = msg.text()
    if (!text.includes('[settlement-form-action]')) return
    const parsed = parseDebugTimingsFromConsoleText(text)
    if (parsed) consoleDebugTimings = parsed
  }

  page.on('console', consoleHandler)

  const saveResponsePromise = page
    .waitForResponse((response) => isSettlementSaveActionResponse(response), {
      timeout: 120_000,
    })
    .catch(() => null)

  const started = performance.now()
  try {
    await saveButton.click()
    const saveResponse = await saveResponsePromise
    if (saveResponse) {
      serverResponseMs = Math.round(performance.now() - started)
      try {
        const text = await saveResponse.text()
        if (text.includes('_debugTimings')) sawDebugMarkerInNetwork = true
        const parsed = parseNetworkDebugTimingsFromResponseText(text)
        if (parsed) networkDebugTimings = parsed
      } catch {
        // ignore body read errors
      }
    }
    await footer.getByText(/저장됨/).waitFor({ state: 'visible', timeout: 120_000 })
    await footer.getByText('저장 중…').waitFor({ state: 'hidden', timeout: 120_000 }).catch(() => {})
  } catch (err) {
    saveResponseOk = false
    saveError = err instanceof Error ? err.message : String(err)
  } finally {
    page.off('console', consoleHandler)
  }

  if (!networkDebugTimings && !consoleDebugTimings && sawDebugMarkerInNetwork) {
    saveError = saveError ?? 'save response contained _debugTimings but parser could not extract timings'
  }

  const browserDurationMs = Math.round(performance.now() - started)

  return {
    run: runIndex,
    saveOk: saveResponseOk,
    error: saveError,
    serverResponseMs,
    browserDurationMs,
    networkDebugTimings,
    consoleDebugTimings,
  }
}

async function main() {
  loadEnvLocal()

  const baseUrl = opt('PERF_BASE_URL', 'https://mtour-settlement.vercel.app').replace(/\/$/, '')
  const email = req('PERF_GUIDE_EMAIL')
  const password = req('PERF_GUIDE_PASSWORD')
  const runCount = parseRuns()
  const outputPath = opt('PERF_OUTPUT', './artifacts/settlement-save-performance.json')
  const headed = opt('PERF_HEADED') === '1'

  const browser = await chromium.launch({ headless: !headed })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await loginGuide(page, baseUrl, email, password)
    const editPath = await resolveEditPath(page, baseUrl)
    const settlementId = extractSettlementIdFromPath(editPath)

    await page.goto(`${baseUrl}${editPath}`, { waitUntil: 'domcontentloaded' })
    await waitForFormReady(page)
    await assertNoForbiddenButtons(page)

    const supabase = settlementId
      ? await createGuideSupabaseClient(email, password)
      : null

    const runs = []
    for (let i = 1; i <= runCount; i += 1) {
      const childRowCounts =
        supabase && settlementId
          ? { before: await countChildRows(supabase, settlementId) }
          : undefined

      const run = await performDraftSaveRun(page, i)

      if (childRowCounts && supabase && settlementId) {
        childRowCounts.after = await countChildRows(supabase, settlementId)
        run.childRowCounts = childRowCounts
      }

      runs.push(run)

      if (i < runCount) {
        await page.waitForTimeout(500)
      }
    }

    const report = buildMeasurementReport(runs, {
      baseUrl,
      editPath,
      settlementId: settlementId ?? undefined,
      runCount,
      measuredAt: new Date().toISOString(),
    })

    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

    console.log(`[measure-settlement-save] wrote ${outputPath}`)
    console.log(
      `[measure-settlement-save] browserDurationMs p50=${report.summary.browserDurationMs.p50 ?? 'n/a'} max=${report.summary.browserDurationMs.max ?? 'n/a'}`,
    )
    console.log(
      `[measure-settlement-save] totalMs p50=${report.summary.totalMs.p50 ?? 'n/a'} (requires SAVE_TIMING_DEBUG=1)`,
    )
    if (report.warnings.length) {
      console.warn('[measure-settlement-save] warnings:')
      for (const w of report.warnings) console.warn(`  - ${w}`)
    } else {
      console.log('[measure-settlement-save] no threshold warnings')
    }
    if (!report.meta.saveTimingDebugEnabled) {
      console.warn(
        '[measure-settlement-save] _debugTimings not captured — enable SAVE_TIMING_DEBUG=1 on the deployment and redeploy.',
      )
    }
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((err) => {
  console.error('[measure-settlement-save] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
