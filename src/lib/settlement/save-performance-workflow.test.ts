import { describe, expect, it } from 'vitest'
import {
  buildCleanupPlan,
  buildFinalSummary,
  buildManualVercelCommands,
  buildWorkflowPlan,
  DEBUG_ENV_VAR,
  parseMeasurementReport,
  resolveWorkflowVercelProject,
  validateWorkflowEnv,
} from '../../../scripts/lib/settlement-save-workflow.mjs'

describe('settlement-save-workflow helpers', () => {
  it('validates required env and refuses missing credentials/target', () => {
    const missing = validateWorkflowEnv({})
    expect(missing.ok).toBe(false)
    expect(missing.errors).toContain('PERF_GUIDE_EMAIL is required')
    expect(missing.errors).toContain('PERF_GUIDE_PASSWORD is required')
    expect(missing.errors).toContain('PERF_SETTLEMENT_EDIT_URL or PERF_TOUR_CODE is required')

    const ok = validateWorkflowEnv({
      PERF_GUIDE_EMAIL: 'guide@example.com',
      PERF_GUIDE_PASSWORD: 'secret',
      PERF_SETTLEMENT_EDIT_URL: '/guide/settlements/abc/edit',
      PERF_RUNS: '3',
    })
    expect(ok.ok).toBe(true)
    expect(ok.config.guideEmail).toBe('guide@example.com')
    expect(ok.config.hasPassword).toBe(true)
    expect(ok.config.editUrl).toBe('/guide/settlements/abc/edit')
  })

  it('resolves Vercel project from base URL or override without secrets', () => {
    expect(
      resolveWorkflowVercelProject(
        { PERF_BASE_URL: 'https://mtour-settlement.vercel.app' },
        { projectName: 'settlement-app-recall' },
      ),
    ).toBe('mtour-settlement')

    expect(
      resolveWorkflowVercelProject(
        { WORKFLOW_VERCEL_PROJECT: 'custom-project' },
        null,
      ),
    ).toBe('custom-project')
  })

  it('builds workflow plan with production env and redeploy steps', () => {
    const plan = buildWorkflowPlan({
      vercelProject: 'mtour-settlement',
      baseUrl: 'https://mtour-settlement.vercel.app',
      outputPath: './artifacts/settlement-save-performance.json',
      runs: 3,
      editTarget: '/guide/settlements/x/edit',
      guideEmail: 'guide@example.com',
    })

    expect(plan.vercelProject).toBe('mtour-settlement')
    expect(plan.environment).toBe('production')
    expect(plan.envVar).toBe(DEBUG_ENV_VAR)
    expect(plan.redeployCount).toBe(2)
    expect(plan.excludedActions).toContain('submit')
    expect(plan.steps.some((s) => s.includes(DEBUG_ENV_VAR))).toBe(true)
  })

  it('parses measurement summary from report JSON', () => {
    const parsed = parseMeasurementReport({
      meta: {
        saveTimingDebugEnabled: true,
        measuredAt: '2026-06-10T00:00:00.000Z',
        editPath: '/guide/settlements/x/edit',
        runCount: 3,
      },
      summary: {
        browserDurationMs: { p50: 4100, max: 4300 },
        totalMs: { p50: 3700, max: 3900 },
        postSaveReloadTotalMs: { p50: 1200, max: 1500 },
      },
      warnings: ['totalMs 5200ms exceeds 5000ms'],
      warningFlags: { totalMsOver5000: true },
    })

    expect(parsed.ok).toBe(true)
    expect(parsed.saveTimingDebugEnabled).toBe(true)
    expect(parsed.browserDurationP50).toBe(4100)
    expect(parsed.totalMsP50).toBe(3700)
    expect(parsed.warningCount).toBe(1)
    expect(parsed.warningFlags?.totalMsOver5000).toBe(true)
  })

  it('generates cleanup plan and manual commands when cleanup fails', () => {
    const cleanup = buildCleanupPlan({
      vercelProject: 'mtour-settlement',
      debugEnvEnabled: true,
      cleanupAttempted: true,
      cleanupSucceeded: false,
      measurementSucceeded: false,
      errors: ['vercel env rm failed'],
    })

    expect(cleanup.warnings.some((w) => w.includes(DEBUG_ENV_VAR))).toBe(true)
    expect(cleanup.warnings.some((w) => w.includes('vercel env rm failed'))).toBe(true)
    expect(cleanup.actions.some((a) => a.action === 'remove_env')).toBe(true)

    const manual = buildManualVercelCommands({
      vercelProject: 'mtour-settlement',
      phase: 'disable',
    })
    expect(manual.some((c) => c.includes('env rm'))).toBe(true)
  })

  it('builds final summary without embedding credentials', () => {
    const plan = buildWorkflowPlan({
      vercelProject: 'mtour-settlement',
      baseUrl: 'https://mtour-settlement.vercel.app',
      outputPath: './artifacts/settlement-save-performance.json',
      runs: 3,
      editTarget: '/guide/settlements/x/edit',
      guideEmail: 'guide@example.com',
    })

    const summary = buildFinalSummary({
      plan,
      startedAt: '2026-06-10T00:00:00.000Z',
      finishedAt: '2026-06-10T00:05:00.000Z',
      debugEnvEnabled: true,
      debugEnvRemoved: true,
      redeploys: [{ label: 'enable-debug', ok: true, url: 'https://example.vercel.app' }],
      measurement: parseMeasurementReport({
        meta: { saveTimingDebugEnabled: true },
        summary: { totalMs: { p50: 3000 } },
        warnings: [],
      }),
      outputPath: plan.outputPath,
      cleanupWarnings: [],
    })

    const json = JSON.stringify(summary)
    expect(summary.safety.onlyDraftSave).toBe(true)
    expect(summary.measurement.totalMsP50).toBe(3000)
    expect(json).not.toContain('PERF_GUIDE_PASSWORD')
    expect(json).not.toContain('secret')
  })
})
