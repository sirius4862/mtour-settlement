import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

async function loginViaForm(page: Page, email: string, password: string, pathFragment: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 60_000 })
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: 'Login' }).click()
  await page.waitForURL((url) => url.pathname.includes(pathFragment), { timeout: 90_000 })
}
import {
  assertConfirmationPacket,
  cleanupWorkflowFixture,
  createWorkflowFixture,
  signInSupabase,
  type WorkflowFixture,
} from './helpers/supabase-workflow'
import {
  assertLegacyProductionWorkflowSupabase,
  getSupabaseEnv,
  getTestCreds,
  loadEnvLocal,
} from './helpers/env'

loadEnvLocal()

const creds = getTestCreds()
const supabaseEnv = getSupabaseEnv()

/** Vehicle fee (O79) under 회사 입력 항목 — tracked in confirm diff. */
function vehicleFeeInput(page: Page) {
  return page
    .locator('span:text-is("O79")')
    .locator('xpath=ancestor::div[1]/parent::div')
    .locator('input')
    .first()
}

let fixture: WorkflowFixture | null = null

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  assertLegacyProductionWorkflowSupabase(
    supabaseEnv.url,
    'guide-confirmation-integrity E2E',
  )

  const { client } = await signInSupabase(
    supabaseEnv.url,
    supabaseEnv.anonKey,
    creds.admin.email,
    creds.admin.password,
  )
  const { error } = await client.rpc('admin_send_for_confirmation', {
    p_settlement_id: '00000000-0000-0000-0000-000000000000',
    p_from_status: 'submitted',
    p_actor_id: '00000000-0000-0000-0000-000000000000',
    p_actor_role: 'admin',
    p_before_snapshot_id: '00000000-0000-0000-0000-000000000000',
    p_after_snapshot_id: '00000000-0000-0000-0000-000000000000',
    p_after_payload: {},
    p_after_calc_summary: {},
    p_confirmation_id: '00000000-0000-0000-0000-000000000000',
    p_field_changes: [],
    p_change_count: 0,
    p_admin_note: null,
    p_r85_before: 0,
    p_r85_after: 0,
    p_r87_before: 0,
    p_r87_after: 0,
    p_clear_guide_confirmation: false,
  })
  if (error?.message?.includes('Could not find the function')) {
    throw new Error(
      'admin_send_for_confirmation RPC missing — apply supabase/settlement_workflow_v1_admin_send_confirmation_rpc.sql on staging first',
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
  await cleanupWorkflowFixture(client, fixture)
  fixture = null
})

test('guide confirmation integrity — submit, admin edit, send, guide confirm', async ({ page }) => {
  const runId = `confirm-p0-${Date.now().toString(36)}`

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
    { skipSendForConfirmation: true },
  )

  const settlementId = fixture.settlementId

  const { data: beforeSend } = await adminClient
    .from('settlements')
    .select('status, active_confirmation_id')
    .eq('id', settlementId)
    .single()
  expect(beforeSend?.status).toBe('submitted')
  expect(beforeSend?.active_confirmation_id).toBeNull()

  await loginViaForm(page, creds.admin.email, creds.admin.password, '/admin')
  await page.goto(`/admin/settlements/${settlementId}/edit`)
  await page.waitForLoadState('domcontentloaded')

  await page.getByRole('button', { name: /회사 입력 항목/ }).click()

  const vehicleFee = vehicleFeeInput(page)
  await vehicleFee.waitFor({ state: 'visible', timeout: 30_000 })
  await vehicleFee.fill('50')

  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText(/저장됨/)).toBeVisible({ timeout: 30_000 })

  const { data: afterSave } = await adminClient
    .from('settlements')
    .select('vehicle_fee_usd')
    .eq('id', settlementId)
    .single()
  if (Number(afterSave?.vehicle_fee_usd) !== 50) {
    throw new Error(
      `admin save did not persist vehicle_fee_usd=50 (got ${afterSave?.vehicle_fee_usd})`,
    )
  }

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '가이드 최종확인 요청' }).click()

  const detailUrl = new RegExp(`/admin/settlements/${settlementId}$`)
  try {
    await page.waitForURL(detailUrl, { timeout: 90_000 })
  } catch {
    const errText = await page.locator('.text-red-500, [role="alert"]').allTextContents()
    throw new Error(
      `send-for-confirmation did not reach detail page; errors: ${errText.join(' | ') || '(none)'}`,
    )
  }

  const { data: afterSend } = await adminClient
    .from('settlements')
    .select('status, active_confirmation_id')
    .eq('id', settlementId)
    .single()
  if (afterSend?.status !== 'pending_guide_confirmation') {
    throw new Error(
      `expected pending_guide_confirmation after send, got ${afterSend?.status} (active_confirmation_id=${afterSend?.active_confirmation_id ?? 'null'})`,
    )
  }

  await assertConfirmationPacket(adminClient, settlementId, { requireFieldChanges: true })

  await page.context().clearCookies()
  await loginViaForm(page, creds.guide.email, creds.guide.password, '/guide')
  await page.goto(`/guide/settlements/${settlementId}/confirm`)
  await expect(page.getByText('관리자 확인 요청')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/변경된 항목/)).toBeVisible()
  await expect(page.getByText('차량비')).toBeVisible()

  await page.getByRole('button', { name: '확인하고 승인' }).click()
  await page.waitForURL(new RegExp(`/guide/settlements/${settlementId}$`), { timeout: 60_000 })
  await expect(page.getByText('확인 완료')).toBeVisible({ timeout: 30_000 })

  const { data: afterConfirm } = await adminClient
    .from('settlements')
    .select('guide_confirmed_at, status')
    .eq('id', settlementId)
    .single()
  expect(afterConfirm?.status).toBe('pending_guide_confirmation')
  expect(afterConfirm?.guide_confirmed_at).not.toBeNull()
})
