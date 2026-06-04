import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  adminRequestEdit,
  cleanupWorkflowFixture,
  createWorkflowFixture,
  guideSubmit,
  insertOtherExpenseItems,
  guideCanDeleteOtherExpenseItem,
  signInSupabase,
  TEST_MARKER,
  type WorkflowFixture,
} from './helpers/supabase-workflow'
import { getSupabaseEnv, getTestCreds, loadEnvLocal } from './helpers/env'

loadEnvLocal()

const creds = getTestCreds()
const supabaseEnv = getSupabaseEnv()
const STAGING_REF = 'xqkdsgjwftfaacvppxag'
const DUPLICATE_DESC = `${TEST_MARKER}-dup-parking`

async function loginViaForm(page: Page, email: string, password: string, pathFragment: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 60_000 })
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: 'Login' }).click()
  await page.waitForURL((url) => url.pathname.includes(pathFragment), { timeout: 90_000 })
}

let fixture: WorkflowFixture | null = null

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  if (!supabaseEnv.url.includes(STAGING_REF)) {
    throw new Error(
      `Refusing guide-save-then-submit E2E: Supabase URL must include staging ref ${STAGING_REF}`,
    )
  }
})

test.afterAll(async () => {
  if (!fixture) return
  const { client } = await signInSupabase(
    supabaseEnv.url,
    supabaseEnv.anonKey,
    creds.admin.email,
    creds.admin.password,
  )
  try {
    await cleanupWorkflowFixture(client, fixture)
  } catch (err) {
    console.warn('[guide-save-then-submit] cleanup failed:', err)
  }
  fixture = null
})

test('Scenario A: save-then-submit persists other_expense_items correction', async ({ page }) => {
  const runId = `save-submit-${Date.now().toString(36)}`

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
  const { data: prof } = await guideClient
    .from('profiles')
    .select('branch_id')
    .eq('id', guideId)
    .single()
  if (!prof?.branch_id) throw new Error('guide missing branch_id')

  fixture = await createWorkflowFixture(
    adminClient,
    guideClient,
    guideId,
    prof.branch_id,
    adminId,
    runId,
    { skipGuideSubmit: true, skipSendForConfirmation: true },
  )

  const settlementId = fixture.settlementId

  const guideDeleteOk = await guideCanDeleteOtherExpenseItem(guideClient, settlementId)
  test.skip(
    !guideDeleteOk,
    'Staging DB: guide DELETE on other_expense_items blocked. Run workflow v1 migrations (P2a) on xqkdsgjwftfaacvppxag.',
  )

  const insertedOthers = await insertOtherExpenseItems(guideClient, settlementId, [
    { description: DUPLICATE_DESC, amount_usd: 25 },
    { description: `${DUPLICATE_DESC}-extra`, amount_usd: 15 },
  ])
  expect(insertedOthers).toHaveLength(2)
  const extraRowId = insertedOthers.find((r) => r.description === `${DUPLICATE_DESC}-extra`)?.id
  if (!extraRowId) throw new Error('missing extra other_expense_items row id')

  await guideSubmit(guideClient, settlementId, guideId)

  const { data: submitted } = await adminClient
    .from('settlements')
    .select('status')
    .eq('id', settlementId)
    .single()
  expect(submitted?.status).toBe('submitted')

  await adminRequestEdit(adminClient, settlementId, adminId)

  const { data: editReq } = await adminClient
    .from('settlements')
    .select('status')
    .eq('id', settlementId)
    .single()
  expect(editReq?.status).toBe('edit_requested')

  await loginViaForm(page, creds.guide.email, creds.guide.password, '/guide')
  await page.goto(`/guide/settlements/${settlementId}/edit`)
  await page.waitForLoadState('domcontentloaded')

  const correctedNote = `${TEST_MARKER}-corrected-note`
  const othersAccordion = page
    .locator('.rounded-2xl.border.border-gray-100')
    .filter({ has: page.getByRole('button', { name: /기타지출/ }) })
  await page.getByRole('button', { name: /기타지출/ }).click()
  const rowCards = othersAccordion.locator('.rounded-xl.border.border-gray-100')
  await expect(rowCards).toHaveCount(2, { timeout: 30_000 })

  const extraCard = rowCards.filter({
    has: page.locator(`input[value="${DUPLICATE_DESC}-extra"]`),
  })
  await extraCard.getByRole('button', { name: '삭제' }).click()
  await expect(rowCards).toHaveCount(1, { timeout: 10_000 })

  const keepCard = rowCards.filter({
    has: page.locator(`input[value="${DUPLICATE_DESC}"]`),
  })
  const noteInput = keepCard
    .locator('div')
    .filter({ hasText: '메모 (선택)' })
    .locator('input')
  await noteInput.fill(correctedNote)
  await expect(noteInput).toHaveValue(correctedNote, { timeout: 10_000 })
  await expect(page.getByText('변경됨')).toBeVisible({ timeout: 10_000 })

  page.once('dialog', (dialog) => dialog.accept())
  await page
    .locator('.fixed.bottom-16')
    .getByRole('button', { name: '저장 후 제출' })
    .click()

  const detailUrl = new RegExp(`/guide/settlements/${settlementId}$`)
  const navigated = await page
    .waitForURL(detailUrl, { timeout: 90_000 })
    .then(() => true)
    .catch(() => false)
  if (!navigated) {
    await expect(page.getByText(/저장|제출/).first()).toBeVisible({ timeout: 5_000 })
    throw new Error('저장 후 제출 did not navigate to detail — check save/submit error on edit page')
  }

  const { data: afterStatus } = await adminClient
    .from('settlements')
    .select('status, guide_submit_snapshot_id')
    .eq('id', settlementId)
    .single()
  expect(afterStatus?.status).toBe('submitted')
  if (!afterStatus?.guide_submit_snapshot_id) {
    throw new Error('missing guide_submit_snapshot_id after submit')
  }

  const { data: snap, error: snapErr } = await adminClient
    .from('settlement_snapshots')
    .select('payload_json')
    .eq('id', afterStatus.guide_submit_snapshot_id)
    .single()
  if (snapErr) throw new Error(snapErr.message)
  const snapOthers = (snap?.payload_json as { others?: { description?: string; note?: string | null }[] })
    ?.others ?? []
  expect(snapOthers).toHaveLength(1)
  expect(snapOthers[0]?.description).toBe(DUPLICATE_DESC)
  expect(snapOthers[0]?.note).toBe(correctedNote)

  const { count: afterCount, data: afterRows, error: afterOthersErr } = await adminClient
    .from('other_expense_items')
    .select('id, description, note', { count: 'exact' })
    .eq('settlement_id', settlementId)
  if (afterOthersErr) throw new Error(afterOthersErr.message)
  expect(afterCount).toBe(1)
  expect(afterRows?.some((r) => r.description === `${DUPLICATE_DESC}-extra`)).toBe(false)

  await page.context().clearCookies()
  await loginViaForm(page, creds.admin.email, creds.admin.password, '/admin')
  await page.goto(`/admin/settlements/${settlementId}`)
  await page.waitForLoadState('domcontentloaded')

  await expect(page.getByRole('cell', { name: DUPLICATE_DESC, exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: `${DUPLICATE_DESC}-extra`, exact: true })).toHaveCount(0)
  await expect(page.getByRole('cell', { name: correctedNote, exact: true })).toBeVisible()
})
