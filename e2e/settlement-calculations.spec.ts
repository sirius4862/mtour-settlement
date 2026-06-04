import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  signInSupabase,
  TEST_MARKER,
  type WorkflowFixture,
} from './helpers/supabase-workflow'
import { getSupabaseEnv, getTestCreds, loadEnvLocal } from './helpers/env'
import { formatUsd } from '../src/lib/settlement/format-currency'

loadEnvLocal()

const creds = getTestCreds()
const supabaseEnv = getSupabaseEnv()
const STAGING_REF = 'xqkdsgjwftfaacvppxag'

type ScenarioInputs = {
  tcCompanyUsd: number
  groundFeeUsd: number
  vehicleFeeUsd: number
  headTaxUsd: number
  seoulBizFeeUsd: number
  megugiUsd: number
  guideDailyFeeUsd: number
}

type ExpectedSummary = {
  companyDepositUsd: number
  guideSettlementUsd: number
  guidePayoutUsd: number
  companyProfitUsd: number
}

type CalculationScenario = {
  name: string
  runSlug: string
  inputs: ScenarioInputs
  expected: ExpectedSummary
  expectsPayoutFloor: boolean
  persistAndReopen: boolean
}

const scenarios: CalculationScenario[] = [
  {
    name: 'Scenario A: normal positive guide payout',
    runSlug: 'calc-positive',
    inputs: {
      tcCompanyUsd: 15,
      groundFeeUsd: 300,
      vehicleFeeUsd: 20,
      headTaxUsd: 10,
      seoulBizFeeUsd: 5,
      megugiUsd: 5,
      guideDailyFeeUsd: 120,
    },
    expected: expectedSummary({
      tcCompanyUsd: 15,
      groundFeeUsd: 300,
      vehicleFeeUsd: 20,
      headTaxUsd: 10,
      seoulBizFeeUsd: 5,
      megugiUsd: 5,
      guideDailyFeeUsd: 120,
    }),
    expectsPayoutFloor: false,
    persistAndReopen: true,
  },
  {
    name: 'Scenario B: negative guide settlement floors live payout to zero',
    runSlug: 'calc-negative-floor',
    inputs: {
      tcCompanyUsd: 20,
      groundFeeUsd: 90,
      vehicleFeeUsd: 30,
      headTaxUsd: 20,
      seoulBizFeeUsd: 10,
      megugiUsd: 10,
      guideDailyFeeUsd: -45,
    },
    expected: expectedSummary({
      tcCompanyUsd: 20,
      groundFeeUsd: 90,
      vehicleFeeUsd: 30,
      headTaxUsd: 20,
      seoulBizFeeUsd: 10,
      megugiUsd: 10,
      guideDailyFeeUsd: -45,
    }),
    expectsPayoutFloor: true,
    persistAndReopen: false,
  },
]

const fixtures: WorkflowFixture[] = []

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  if (!supabaseEnv.url.includes(STAGING_REF)) {
    throw new Error(
      `Refusing settlement calculation E2E: Supabase URL must include staging ref ${STAGING_REF}`,
    )
  }
})

test.afterAll(async () => {
  if (!fixtures.length) return

  const { client } = await signInSupabase(
    supabaseEnv.url,
    supabaseEnv.anonKey,
    creds.admin.email,
    creds.admin.password,
  )

  for (const fixture of fixtures.splice(0)) {
    try {
      await cleanupWorkflowFixture(client, fixture)
    } catch (err) {
      console.warn('[settlement-calculations] cleanup failed:', fixture.settlementId, err)
    }
  }
})

for (const scenario of scenarios) {
  test(scenario.name, async ({ page }) => {
    const fixture = await createSubmittedFixture(scenario.runSlug)
    fixtures.push(fixture)

    await loginAsAdmin(page)
    await page.goto(`/admin/settlements/${fixture.settlementId}/edit`, {
      waitUntil: 'domcontentloaded',
    })

    await fillAdminCalculationFields(page, scenario.inputs)

    if (!scenario.persistAndReopen) {
      await assertFooterSummary(page, scenario.expected)
      return
    }

    await saveAdminSettlement(page)
    await assertPersistedDbHeader(fixture.settlementId, scenario.inputs)

    await page.goto(`/admin/settlements/${fixture.settlementId}`, {
      waitUntil: 'domcontentloaded',
    })
    await assertDetailSummary(page, scenario.expected, scenario.expectsPayoutFloor)

    await page.goto(`/admin/settlements/${fixture.settlementId}/edit`, {
      waitUntil: 'domcontentloaded',
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await assertPersistedInputs(page, scenario.inputs)
  })
}

async function createSubmittedFixture(runSlug: string): Promise<WorkflowFixture> {
  const runId = `${runSlug}-${Date.now().toString(36)}`
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

  const { data: profile, error: profileErr } = await guideClient
    .from('profiles')
    .select('branch_id')
    .eq('id', guideId)
    .single()
  if (profileErr || !profile?.branch_id) {
    throw new Error(profileErr?.message ?? 'guide missing branch_id')
  }

  return createWorkflowFixture(
    adminClient,
    guideClient,
    guideId,
    profile.branch_id,
    adminId,
    runId,
    { skipSendForConfirmation: true },
  )
}

async function loginAsAdmin(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 60_000 })
  await page.locator('#login-email').fill(creds.admin.email)
  await page.locator('#login-password').fill(creds.admin.password)
  await page.getByRole('button', { name: 'Login' }).click()
  await page.waitForURL((url) => url.pathname.includes('/admin'), { timeout: 90_000 })
}

async function fillAdminCalculationFields(page: Page, inputs: ScenarioInputs) {
  const tcSection = await openSection(page, 'T/C 정산')
  await inputForLabel(tcSection, 'T/C 정산 — 회사분 (USD)').fill(String(inputs.tcCompanyUsd))

  const companySection = await openSection(page, '회사 입력 항목')
  await inputForLabel(companySection, '지상비').fill(String(inputs.groundFeeUsd))
  await inputForLabel(companySection, '차량비').fill(String(inputs.vehicleFeeUsd))
  await inputForLabel(companySection, '인두세').fill(String(inputs.headTaxUsd))
  await inputForLabel(companySection, '서울영업비').fill(String(inputs.seoulBizFeeUsd))
  await inputForLabel(companySection, '메꾸기').fill(String(inputs.megugiUsd))
  await inputForLabel(companySection, '가이드 일비').fill(String(inputs.guideDailyFeeUsd))

  await expect(page.getByText('변경됨')).toBeVisible({ timeout: 10_000 })
}

async function assertPersistedInputs(page: Page, inputs: ScenarioInputs) {
  const tcSection = await openSection(page, 'T/C 정산')
  await expect(inputForLabel(tcSection, 'T/C 정산 — 회사분 (USD)')).toHaveValue(
    String(inputs.tcCompanyUsd),
  )

  const companySection = await openSection(page, '회사 입력 항목')
  await expect(inputForLabel(companySection, '지상비')).toHaveValue(String(inputs.groundFeeUsd))
  await expect(inputForLabel(companySection, '차량비')).toHaveValue(String(inputs.vehicleFeeUsd))
  await expect(inputForLabel(companySection, '인두세')).toHaveValue(String(inputs.headTaxUsd))
  await expect(inputForLabel(companySection, '서울영업비')).toHaveValue(
    String(inputs.seoulBizFeeUsd),
  )
  await expect(inputForLabel(companySection, '메꾸기')).toHaveValue(String(inputs.megugiUsd))
  await expect(inputForLabel(companySection, '가이드 일비')).toHaveValue(
    String(inputs.guideDailyFeeUsd),
  )
}

async function assertFooterSummary(page: Page, expected: ExpectedSummary) {
  const footer = page.locator('.fixed.bottom-16')
  await expect(footer).toContainText(formatUsd(expected.companyDepositUsd))
  await expect(footer).toContainText(formatUsd(expected.guideSettlementUsd))
  await expect(footer).toContainText('실제 지급액 · P85')
  await expect(footer).toContainText(formatUsd(expected.companyProfitUsd))
}

async function saveAdminSettlement(page: Page) {
  const footer = page.locator('.fixed.bottom-16')
  await footer.getByRole('button', { name: '임시저장' }).click()
  await expect(footer.getByText(/저장됨/)).toBeVisible({ timeout: 30_000 })
  await expect(footer.getByText('변경됨')).toHaveCount(0, { timeout: 10_000 })
}

async function assertPersistedDbHeader(settlementId: string, inputs: ScenarioInputs) {
  const { client } = await signInSupabase(
    supabaseEnv.url,
    supabaseEnv.anonKey,
    creds.admin.email,
    creds.admin.password,
  )
  const { data, error } = await client
    .from('settlements')
    .select(
      'tc_company_usd, ground_fee_usd, vehicle_fee_usd, head_tax_usd, seoul_biz_fee_usd, megugi_usd, guide_daily_fee_usd',
    )
    .eq('id', settlementId)
    .single()

  if (error || !data) throw new Error(error?.message ?? 'settlement not found after save')

  expect(data.tc_company_usd).toBe(inputs.tcCompanyUsd)
  expect(data.ground_fee_usd).toBe(inputs.groundFeeUsd)
  expect(data.vehicle_fee_usd).toBe(inputs.vehicleFeeUsd)
  expect(data.head_tax_usd).toBe(inputs.headTaxUsd)
  expect(data.seoul_biz_fee_usd).toBe(inputs.seoulBizFeeUsd)
  expect(data.megugi_usd).toBe(inputs.megugiUsd)
  expect(data.guide_daily_fee_usd).toBe(inputs.guideDailyFeeUsd)
}

async function assertDetailSummary(
  page: Page,
  expected: ExpectedSummary,
  expectsPayoutFloor: boolean,
) {
  await expectSummaryAmount(page, '회사입금 (Q75):', expected.companyDepositUsd)
  await expectSummaryAmount(page, '계산상 가이드정산 (R85):', expected.guideSettlementUsd)
  await expectSummaryAmount(page, '실제 지급액 (P85):', expected.guidePayoutUsd)
  await expectSummaryAmount(page, '회사수익 (R87):', expected.companyProfitUsd)

  if (expectsPayoutFloor) {
    await expect(page.getByText('가이드 정산금액이 마이너스라 지급액은 $0으로 처리됩니다.')).toBeVisible()
  } else {
    await expect(page.getByText('가이드 정산금액이 마이너스라 지급액은 $0으로 처리됩니다.')).toHaveCount(0)
  }
}

async function openSection(page: Page, title: string): Promise<Locator> {
  const section = page
    .locator('.rounded-2xl.border.border-gray-100')
    .filter({ has: page.getByRole('button', { name: new RegExp(escapeRegex(title)) }) })
  await section.getByRole('button', { name: new RegExp(escapeRegex(title)) }).click()
  return section
}

function inputForLabel(container: Locator, label: string): Locator {
  return container.locator(`xpath=.//label[normalize-space(.)="${label}"]/following::input[1]`)
}

async function expectSummaryAmount(page: Page, label: string, amount: number) {
  await expect(page.locator('p').filter({ hasText: label })).toContainText(formatUsd(amount))
}

function expectedSummary(inputs: ScenarioInputs): ExpectedSummary {
  const companyDepositUsd = 0
  const guideProfitPool = -inputs.megugiUsd - inputs.tcCompanyUsd
  const guideProfitShare = Math.max(guideProfitPool * 0.5, 0)
  const guideSettlementUsd = guideProfitShare + inputs.guideDailyFeeUsd
  const guidePayoutUsd = Math.max(guideSettlementUsd, 0)
  const companyIncomeUsd = inputs.groundFeeUsd
  const companyExpenseUsd =
    inputs.tcCompanyUsd + inputs.vehicleFeeUsd + inputs.headTaxUsd + inputs.seoulBizFeeUsd
  const companyProfitUsd = companyIncomeUsd - companyExpenseUsd - guidePayoutUsd

  return {
    companyDepositUsd,
    guideSettlementUsd,
    guidePayoutUsd,
    companyProfitUsd,
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
