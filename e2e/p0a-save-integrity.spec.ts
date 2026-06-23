/**
 * P0-A save-integrity browser reproduction (local dev + production Supabase until true staging exists).
 *
 * Failure injection: a negative-COM option row reaches the real saveSettlementDraft
 * path. Header insert succeeds; option_items insert fails on DB chk_opt_com.
 * No P0-B pre-insert validation is required.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import {
  assertLegacyProductionWorkflowSupabase,
  getSupabaseEnv,
  getTestCreds,
  loadEnvLocal,
} from './helpers/env'
import { primeRole } from './helpers/storage-state'
import { cleanupWorkflowFixture, signInSupabase, TEST_MARKER } from './helpers/supabase-workflow'
import { SAVE_FAILED_SUBMIT_BLOCKED } from '../src/lib/settlement/save-integrity'
import { SAVE_SETTLEMENT_GENERIC_ERROR } from '../src/lib/server/safe-errors'
loadEnvLocal()

const creds = getTestCreds()
const supabaseEnv = getSupabaseEnv()
const baseURL = process.env.P0A_E2E_BASE_URL?.trim() || 'http://127.0.0.1:3000'
const MARKER = `${TEST_MARKER}-P0A-SAVE-INT`

type DraftStorage = {
  state?: {
    settlementId?: string | null
    tourId?: string | null
    dirty?: boolean
    saveStatus?: string
    saveError?: string | null
    options?: Array<{ option_name?: string; option_date?: string | null; deleted?: boolean }>
    entrances?: Array<{ attraction_name?: string; visit_date?: string | null; deleted?: boolean }>
  }
}

let tourId: string | null = null
let orphanSettlementId: string | null = null

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  assertLegacyProductionWorkflowSupabase(supabaseEnv.url, 'P0-A save-integrity E2E')
})

test.afterAll(async () => {
  const { client: adminClient } = await signInSupabase(
    supabaseEnv.url,
    supabaseEnv.anonKey,
    creds.admin.email,
    creds.admin.password,
  )
  if (orphanSettlementId && tourId) {
    try {
      await cleanupWorkflowFixture(adminClient, {
        runId: 'p0a-cleanup',
        tourId,
        settlementId: orphanSettlementId,
        tourCode: MARKER,
      })
    } catch (err) {
      console.warn('[p0a-save-integrity] settlement cleanup failed:', err)
    }
  }
  if (tourId) {
    await adminClient.from('tours').delete().eq('id', tourId)
  }
})

async function createTourWithoutSettlement() {
  const { client: adminClient, userId: adminId } = await signInSupabase(
    supabaseEnv.url,
    supabaseEnv.anonKey,
    creds.admin.email,
    creds.admin.password,
  )
  const { client: guideClient, userId: guideId } = await signInSupabase(
    supabaseEnv.url,
    supabaseEnv.anonKey,
    creds.guide.email,
    creds.guide.password,
  )
  const { data: profile } = await guideClient
    .from('profiles')
    .select('branch_id')
    .eq('id', guideId)
    .single()
  if (!profile?.branch_id) throw new Error('guide missing branch_id')

  const id = randomUUID()
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() + 14)
  const end = new Date(start)
  end.setDate(end.getDate() + 2)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const { error } = await adminClient.from('tours').insert({
    id,
    tour_code: `${MARKER}-${Date.now().toString(36)}`,
    pattern: `[${MARKER}] browser repro`,
    agency_name: TEST_MARKER,
    start_date: fmt(start),
    end_date: fmt(end),
    pax_count: 8,
    vehicle_type: '29인승',
    guide_id: guideId,
    tc_name: `${MARKER}-TC`,
    branch_id: profile.branch_id,
    created_by: adminId,
  })
  if (error) throw new Error(error.message)
  tourId = id
  return id
}

async function ensureSectionOpen(page: Page, title: RegExp) {
  const headerButton = page.getByRole('button', { name: title }).first()
  await expect(headerButton).toBeVisible({ timeout: 15_000 })
  await headerButton.scrollIntoViewIfNeeded()
  if ((await headerButton.getAttribute('aria-expanded')) !== 'true') {
    await headerButton.click()
    await expect(headerButton).toHaveAttribute('aria-expanded', 'true', { timeout: 10_000 })
  }
  return page.locator('.rounded-2xl.border.border-gray-100').filter({ has: headerButton })
}

async function readDraftStorage(page: Page): Promise<DraftStorage> {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem('settlement-form-draft')
    return raw ? (JSON.parse(raw) as DraftStorage) : {}
  })
}

function activeDraftRows<T extends { deleted?: boolean }>(rows: T[] | undefined) {
  return (rows ?? []).filter((row) => !row.deleted)
}

async function countMarkerInputsInSection(page: Page, title: RegExp, marker: string) {
  const section = await ensureSectionOpen(page, title)
  return section.evaluate((root, m) => {
    return Array.from(root.querySelectorAll('input')).filter((el) =>
      (el as HTMLInputElement).value.includes(m),
    ).length
  }, marker)
}

async function fillEntranceRow(card: Locator, date: string, name: string) {
  await card.locator('input[type="date"]').fill(date)
  await card.locator('input:not([type="date"])').nth(0).fill(name)
}

async function fillOptionRow(
  card: Locator,
  opts: { date?: string; name: string; unitPrice: string; pax: string; expenseUsd?: string },
) {
  if (opts.date) await card.locator('input[type="date"]').fill(opts.date)
  const fields = card.locator('input:not([type="date"])')
  await fields.nth(0).fill(opts.name)
  await fields.nth(1).fill(opts.unitPrice)
  await fields.nth(2).fill(opts.pax)
  if (opts.expenseUsd) await fields.nth(3).fill(opts.expenseUsd)
}

async function countSettlementsForTour(tourIdValue: string) {
  const { client: adminClient } = await signInSupabase(
    supabaseEnv.url,
    supabaseEnv.anonKey,
    creds.admin.email,
    creds.admin.password,
  )
  const { count, error } = await adminClient
    .from('settlements')
    .select('id', { count: 'exact', head: true })
    .eq('tour_id', tourIdValue)
  if (error) throw new Error(error.message)
  return count ?? 0
}

async function assertBoundSettlementExists(settlementId: string, tourIdValue: string) {
  const { client: adminClient } = await signInSupabase(
    supabaseEnv.url,
    supabaseEnv.anonKey,
    creds.admin.email,
    creds.admin.password,
  )
  const { data, error } = await adminClient
    .from('settlements')
    .select('id, tour_id')
    .eq('id', settlementId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  expect(data?.id).toBe(settlementId)
  expect(data?.tour_id).toBe(tourIdValue)
}

test.beforeEach(async ({ context }) => {
  await primeRole(
    context,
    supabaseEnv.url,
    supabaseEnv.anonKey,
    creds.guide.email,
    creds.guide.password,
    baseURL,
  )
})

test('P0-A deceptive failed-save sequence preserves rows, dates, and honest footer', async ({
  page,
}) => {
  const consoleErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(err.message))

  const assignedTourId = await createTourWithoutSettlement()
  const urlBeforeSave = `/guide/settlements/new?tourId=${assignedTourId}`

  await page.goto(urlBeforeSave, { waitUntil: 'domcontentloaded' })
  await page.waitForURL((url) => url.pathname.includes('/guide/settlements/new'), {
    timeout: 90_000,
  })
  await expect(page.getByRole('heading', { name: '새 정산서' })).toBeVisible()

  const footer = page.locator('.fixed.bottom-16')
  const optionDate = '2026-04-06'
  const entranceDate = '2026-04-07'

  const entranceSection = await ensureSectionOpen(page, /입장료/)
  await entranceSection.getByRole('button', { name: '+ 입장료 추가' }).click()
  const entranceCard = entranceSection.locator('.rounded-xl.border.border-gray-100').last()
  await fillEntranceRow(entranceCard, entranceDate, `${MARKER}-entrance`)

  const optionSection = await ensureSectionOpen(page, /옵션/)
  await optionSection.getByRole('button', { name: '+ 옵션 추가' }).click()
  const validOption = optionSection.locator('.rounded-xl.border.border-gray-100').last()
  await fillOptionRow(validOption, {
    date: optionDate,
    name: `${MARKER}-valid-option`,
    unitPrice: '20',
    pax: '2',
  })

  await optionSection.getByRole('button', { name: '+ 옵션 추가' }).click()
  const failOptionCard = optionSection.locator('.rounded-xl.border.border-gray-100').last()
  await fillOptionRow(failOptionCard, {
    name: `${MARKER}-fail-option`,
    unitPrice: '10',
    pax: '1',
    expenseUsd: '200',
  })

  await expect(footer.getByText('변경됨')).toBeVisible()

  await footer.getByRole('button', { name: '임시저장' }).click()

  const statusLine = footer.locator('p.text-center.text-xs.text-red-500')
  await expect(statusLine).toBeVisible({ timeout: 60_000 })
  await expect(statusLine).toContainText(SAVE_SETTLEMENT_GENERIC_ERROR)
  await expect(statusLine).not.toContainText('투어를 선택해주세요')
  await expect(footer.locator('p.text-emerald-600')).toHaveCount(0)
  await expect(footer.getByText(/^저장됨/)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '새 정산서' })).toBeVisible()
  await expect.poll(async () => (await readDraftStorage(page)).state?.saveStatus).toBe('error')

  const draftAfterFail = await readDraftStorage(page)
  expect(draftAfterFail.state?.settlementId).toBeTruthy()
  expect(draftAfterFail.state?.dirty).toBe(true)
  expect(draftAfterFail.state?.saveStatus).toBe('error')
  expect(draftAfterFail.state?.tourId).toBe(assignedTourId)
  expect(activeDraftRows(draftAfterFail.state?.options)).toHaveLength(2)
  expect(activeDraftRows(draftAfterFail.state?.entrances)).toHaveLength(1)
  expect(draftAfterFail.state?.options?.[0]?.option_date).toBe(optionDate)
  expect(draftAfterFail.state?.entrances?.[0]?.visit_date).toBe(entranceDate)
  orphanSettlementId = draftAfterFail.state?.settlementId ?? null
  const boundIdAfterFail = draftAfterFail.state?.settlementId
  expect(await page.evaluate(() => sessionStorage.getItem('settlement-form-draft'))).toBeTruthy()

  expect(page.url()).toContain('/guide/settlements/new')
  expect(page.url()).not.toMatch(/\/edit$/)
  await expect(page.getByRole('heading', { name: '새 정산서' })).toBeVisible()

  expect(await countMarkerInputsInSection(page, /옵션/, MARKER)).toBeGreaterThanOrEqual(2)
  expect(await countMarkerInputsInSection(page, /입장료/, MARKER)).toBeGreaterThanOrEqual(1)

  const optionSectionAfterFail = await ensureSectionOpen(page, /옵션/)
  await expect(
    optionSectionAfterFail
      .locator('.rounded-xl.border.border-gray-100')
      .filter({ has: page.locator(`input[value="${MARKER}-valid-option"]`) })
      .first()
      .locator('input[type="date"]'),
  ).toHaveValue(optionDate)

  const entranceSectionAfterFail = await ensureSectionOpen(page, /입장료/)
  await expect(
    entranceSectionAfterFail
      .locator('.rounded-xl.border.border-gray-100')
      .filter({ has: page.locator(`input[value="${MARKER}-entrance"]`) })
      .first()
      .locator('input[type="date"]'),
  ).toHaveValue(entranceDate)

  await assertBoundSettlementExists(boundIdAfterFail!, assignedTourId)
  await expect.poll(async () => countSettlementsForTour(assignedTourId)).toBe(1)

  await footer.getByRole('button', { name: '저장 후 제출' }).click()
  await expect(footer.getByText(SAVE_FAILED_SUBMIT_BLOCKED)).toBeVisible()
  await expect(statusLine).toBeVisible()
  await expect(statusLine).not.toContainText('투어를 선택해주세요')

  const optionSectionForRetry = await ensureSectionOpen(page, /옵션/)
  const failOptionCardForRetry = optionSectionForRetry
    .locator('.rounded-xl.border.border-gray-100')
    .filter({ has: page.locator(`input[value="${MARKER}-fail-option"]`) })
    .first()
  await failOptionCardForRetry.getByRole('button', { name: '삭제' }).click()
  await footer.getByRole('button', { name: '임시저장' }).click()
  await expect(footer.locator('p.text-emerald-600')).toBeVisible({ timeout: 60_000 })
  await page.waitForURL(/\/guide\/settlements\/[^/]+\/edit/, { timeout: 60_000 })

  const successSettlementId = page.url().match(/\/guide\/settlements\/([^/]+)\/edit/)?.[1]
  expect(successSettlementId).toBe(boundIdAfterFail)
  expect(await countSettlementsForTour(assignedTourId)).toBe(1)

  await expect(page.getByRole('heading', { name: '정산서 수정' })).toBeVisible()
  await expect(footer.locator('p.text-emerald-600')).toContainText('저장됨')

  expect(await countMarkerInputsInSection(page, /옵션/, MARKER)).toBeGreaterThanOrEqual(1)
  expect(await countMarkerInputsInSection(page, /입장료/, MARKER)).toBeGreaterThanOrEqual(1)

  const runtimeErrors = consoleErrors.filter(
    (line) =>
      !line.includes('Download the React DevTools') &&
      !line.includes('favicon') &&
      !line.includes('[settlement-form-action]'),
  )
  expect(runtimeErrors, `console/runtime errors: ${runtimeErrors.join(' | ')}`).toEqual([])
})
