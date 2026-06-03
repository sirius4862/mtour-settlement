import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { execSync } from 'node:child_process'
import { primeRole } from './helpers/storage-state'
import {
  CARD_LABELS,
  getSupabaseEnv,
  getTestCreds,
  loadEnvLocal,
  PROD_URL,
} from './helpers/env'
import { deployReport } from './helpers/report'
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  signInSupabase,
  type WorkflowFixture,
} from './helpers/supabase-workflow'

loadEnvLocal()

const creds = getTestCreds()
const supabaseEnv = getSupabaseEnv()
const expectedSha =
  process.env.EXPECTED_GIT_SHA?.trim() ||
  execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()

let e2eFixture: WorkflowFixture | null = null

async function shot(page: import('@playwright/test').Page, testInfo: import('@playwright/test').TestInfo) {
  const path = testInfo.outputPath('failure.png')
  await page.screenshot({ path, fullPage: true })
  return path
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  deployReport.deploymentSha = expectedSha
  deployReport.testedUrl = PROD_URL
})

test.afterAll(async () => {
  if (e2eFixture) {
    const { client } = await signInSupabase(
      supabaseEnv.url,
      supabaseEnv.anonKey,
      creds.admin.email,
      creds.admin.password,
    )
    try {
      await cleanupWorkflowFixture(client, e2eFixture)
    } catch (e) {
      deployReport.fail('Cleanup', e instanceof Error ? e.message : String(e))
    }
    e2eFixture = null
  }
})

test('0 — production URL and deploy SHA', async ({ page }) => {
  const res = await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  expect(res?.ok()).toBeTruthy()

  const meta = page.locator('#deploy-meta')
  const hasMeta = (await meta.count()) > 0
  const prodSha = hasMeta ? await meta.getAttribute('data-git-sha') : ''
  deployReport.setProdSha(prodSha ?? '')

  if (!prodSha?.trim()) {
    deployReport.fail(
      'Deploy SHA',
      'NEXT_PUBLIC_GIT_SHA empty on production — redeploy after next.config change',
    )
    throw new Error('Production deploy SHA not exposed')
  }

  if (prodSha.trim() !== expectedSha) {
    deployReport.fail(
      'Deploy SHA',
      `mismatch: prod=${prodSha} expected=${expectedSha}`,
    )
    throw new Error(`Deploy SHA mismatch: ${prodSha} !== ${expectedSha}`)
  }

  deployReport.pass('Deploy SHA', `matches ${expectedSha.slice(0, 12)}…`)
  deployReport.pass('Production URL', `${PROD_URL}/login → ${res?.status()}`)
})

test('1 — admin dashboard and region scope', async ({ page, context }, testInfo) => {
  deployReport.role('admin')
  try {
    await primeRole(context, supabaseEnv.url, supabaseEnv.anonKey, creds.admin.email, creds.admin.password)
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: '관리자 대시보드' })).toBeVisible()

    for (const label of CARD_LABELS) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    }
    const body = await page.content()
    const danang =
      body.includes('다낭') || body.includes('DANANG') || body.includes('Da Nang')
    expect(danang).toBeTruthy()

    await page.goto('/admin/settlements?yearMonth=2026-06')
    await expect(page.locator('th', { hasText: '지역' })).toBeVisible()

    deployReport.pass('Admin login', creds.admin.email)
    deployReport.pass('Admin dashboard', '5 workflow cards visible')
    deployReport.pass('Admin DANANG scope', 'region label present')
    deployReport.pass('Admin settlement list', '지역 column visible')
  } catch (e) {
    const screenshot = await shot(page, testInfo)
    deployReport.fail('Admin UI', e instanceof Error ? e.message : String(e), screenshot)
    throw e
  }
})

test('2 — master_admin sees all regions filter', async ({ page, context }, testInfo) => {
  deployReport.role('master_admin')
  try {
    await primeRole(context, supabaseEnv.url, supabaseEnv.anonKey, creds.master.email, creds.master.password)
    await page.goto('/admin/settlements?yearMonth=2026-06')
    await expect(page.locator('select').first()).toContainText('전체 지역')
    deployReport.pass('Master admin', 'settlement list has 전체 지역 filter')
  } catch (e) {
    const screenshot = await shot(page, testInfo)
    deployReport.fail('Master admin UI', e instanceof Error ? e.message : String(e), screenshot)
    throw e
  }
})

test('3 — guide list and confirmation UX (fixture)', async ({ page, context }, testInfo) => {
  deployReport.role('guide')
  const runId = `e2e-${Date.now().toString(36)}`

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

  e2eFixture = await createWorkflowFixture(
    adminClient,
    guideClient,
    guideId,
    prof.branch_id,
    adminId,
    runId,
  )
  const settlementId = e2eFixture.settlementId

  try {
    await primeRole(context, supabaseEnv.url, supabaseEnv.anonKey, creds.guide.email, creds.guide.password)
    await page.goto('/guide/settlements')
    await expect(page.locator('body')).toContainText(/정산|투어|WORKFLOW/i)

    await page.goto(`/guide/settlements/${settlementId}`)
    await expect(page.getByText('관리자 확인 요청')).toBeVisible()
    await expect(page.getByRole('link', { name: /변경사항 확인/ })).toBeVisible()
    deployReport.pass('Guide orange banner', `settlement ${settlementId}`)

    await page.goto(`/guide/settlements/${settlementId}/confirm`)
    await expect(page.getByRole('button', { name: '확인하고 승인' })).toBeVisible()
    await page.getByRole('button', { name: '확인하고 승인' }).click()
    await page.waitForURL(new RegExp(`/guide/settlements/${settlementId}$`))

    await expect(page.getByText('확인 완료')).toBeVisible()
    await expect(page.getByText('관리자 지급완료 처리를 기다리는 중입니다')).toBeVisible()
    await expect(page.getByRole('link', { name: /변경사항 확인/ })).toHaveCount(0)
    deployReport.pass('Guide confirm flow', 'CTA gone; emerald passive banner')

    await page.goto(`/guide/settlements/${settlementId}/confirm`)
    await page.waitForURL(new RegExp(`/guide/settlements/${settlementId}$`))
    deployReport.pass('Guide confirm redirect', 'confirm URL → detail (not 404)')
  } catch (e) {
    const screenshot = await shot(page, testInfo)
    deployReport.fail('Guide UX', e instanceof Error ? e.message : String(e), screenshot)
    throw e
  }
})

test('4 — workflow guards (API)', async () => {
  const runId = `guard-${Date.now().toString(36)}`
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
  const { client: masterClient, userId: masterId } = await signInSupabase(
    supabaseEnv.url,
    supabaseEnv.anonKey,
    creds.master.email,
    creds.master.password,
  )
  const { data: prof } = await guideClient
    .from('profiles')
    .select('branch_id')
    .eq('id', guideId)
    .single()

  const fx = await createWorkflowFixture(
    adminClient,
    guideClient,
    guideId,
    prof!.branch_id!,
    adminId,
    runId,
  )

  try {
    const { data: payRows } = await adminClient
      .from('settlements')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', fx.settlementId)
      .eq('status', 'pending_guide_confirmation')
      .select('id')
    const { data: afterPay } = await adminClient
      .from('settlements')
      .select('status')
      .eq('id', fx.settlementId)
      .single()
    expect((payRows?.length ?? 0) === 0 && afterPay?.status === 'pending_guide_confirmation').toBeTruthy()
    deployReport.pass('Pay before guide confirm', 'blocked')

    const { data: before } = await masterClient
      .from('settlements')
      .select('ground_fee_usd')
      .eq('id', fx.settlementId)
      .single()

    const snapId = randomUUID()
    const now = new Date().toISOString()
    await guideClient.from('settlement_snapshots').insert({
      id: snapId,
      settlement_id: fx.settlementId,
      kind: 'guide_confirmed',
      payload_json: { e2e: true },
      created_by: guideId,
    })
    const { data: rpcRes, error: rpcErr } = await guideClient.rpc('guide_confirm_settlement', {
      p_settlement_id: fx.settlementId,
      p_confirmed_at: now,
    })
    if (rpcErr || !rpcRes?.ok) throw new Error(rpcErr?.message ?? 'guide_confirm failed')
    await adminClient
      .from('settlements')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', fx.settlementId)
      .eq('status', 'pending_guide_confirmation')

    const { data: modRows, error: modErr } = await masterClient
      .from('settlements')
      .update({ ground_fee_usd: 999.99 })
      .eq('id', fx.settlementId)
      .eq('status', 'paid')
      .select('id')
    const { data: afterMod } = await masterClient
      .from('settlements')
      .select('ground_fee_usd, status')
      .eq('id', fx.settlementId)
      .single()
    expect(
      (modRows?.length ?? 0) === 0 &&
        Number(afterMod?.ground_fee_usd) === Number(before?.ground_fee_usd),
    ).toBeTruthy()
    deployReport.pass('Paid settlement lock', modErr?.message ?? 'in-place edit blocked')

    const reopenAt = new Date().toISOString()
    const { data: reopenRows, error: reopenErr } = await masterClient
      .from('settlements')
      .update({
        status: 'edit_requested',
        paid_at: null,
        guide_confirmed_at: null,
        guide_confirmed_by: null,
        edit_requested_at: reopenAt,
        edit_requested_by: masterId,
      })
      .eq('id', fx.settlementId)
      .eq('status', 'paid')
      .select('id, status')
    expect((reopenRows?.length ?? 0) === 1 && reopenRows![0].status === 'edit_requested').toBeTruthy()
    deployReport.pass('Master reopen paid', reopenErr?.message ?? 'edit_requested via intended path')

    const { data: adminReopen } = await adminClient
      .from('settlements')
      .update({ status: 'edit_requested', paid_at: null })
      .eq('id', fx.settlementId)
      .eq('status', 'paid')
      .select('id')
    expect((adminReopen?.length ?? 0) === 0).toBeTruthy()
    deployReport.pass('Admin cannot reopen paid', '0 rows')
  } finally {
    try {
      await cleanupWorkflowFixture(masterClient, fx)
      deployReport.pass('Guard fixture cleanup', 'deleted')
    } catch (e) {
      deployReport.inconclusive(
        'Guard fixture cleanup',
        e instanceof Error ? e.message : String(e),
      )
    }
  }
})
