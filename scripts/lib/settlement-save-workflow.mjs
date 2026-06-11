/**
 * Pure helpers for the settlement save performance workflow wrapper.
 * No Vercel calls, no secrets — safe to unit test from Vitest.
 */

export const DEBUG_ENV_VAR = 'SAVE_TIMING_DEBUG'
export const DEBUG_ENV_VALUE = '1'
export const VERCEL_ENV_TARGET = 'production'

const DEFAULT_BASE_URL = 'https://mtour-settlement.vercel.app'
const DEFAULT_OUTPUT = './artifacts/settlement-save-performance.json'

/**
 * @param {Record<string, string | undefined>} [env]
 */
export function validateWorkflowEnv(env = process.env) {
  const errors = []
  const email = env.PERF_GUIDE_EMAIL?.trim()
  const password = env.PERF_GUIDE_PASSWORD?.trim()
  const editUrl = env.PERF_SETTLEMENT_EDIT_URL?.trim()
  const tourCode = env.PERF_TOUR_CODE?.trim()

  if (!email) errors.push('PERF_GUIDE_EMAIL is required')
  if (!password) errors.push('PERF_GUIDE_PASSWORD is required')
  if (!editUrl && !tourCode) {
    errors.push('PERF_SETTLEMENT_EDIT_URL or PERF_TOUR_CODE is required')
  }

  const runsRaw = env.PERF_RUNS?.trim() || '3'
  const runs = parseInt(runsRaw, 10)
  if (!Number.isFinite(runs) || runs < 1) {
    errors.push(`PERF_RUNS must be a positive integer, got "${runsRaw}"`)
  }

  return {
    ok: errors.length === 0,
    errors,
    config: {
      baseUrl: (env.PERF_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, ''),
      guideEmail: email ?? '',
      hasPassword: Boolean(password),
      editUrl: editUrl ?? '',
      tourCode: tourCode ?? '',
      editTarget: editUrl || (tourCode ? `tour_code:${tourCode}` : ''),
      runs: Number.isFinite(runs) && runs >= 1 ? runs : 3,
      outputPath: env.PERF_OUTPUT?.trim() || DEFAULT_OUTPUT,
      headed: env.PERF_HEADED?.trim() === '1',
      workflowVercelProject: env.WORKFLOW_VERCEL_PROJECT?.trim() || '',
      semiAuto: env.WORKFLOW_SEMI_AUTO?.trim() === '1',
      autoConfirm: env.WORKFLOW_AUTO_CONFIRM?.trim() === 'YES',
    },
  }
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {{ projectName?: string } | null} projectJson
 */
export function resolveWorkflowVercelProject(env, projectJson) {
  if (env.WORKFLOW_VERCEL_PROJECT?.trim()) {
    return env.WORKFLOW_VERCEL_PROJECT.trim()
  }
  const baseUrl = env.PERF_BASE_URL?.trim() || DEFAULT_BASE_URL
  if (baseUrl.includes('mtour-settlement')) {
    return 'mtour-settlement'
  }
  if (projectJson?.projectName) {
    return projectJson.projectName
  }
  return null
}

/**
 * @param {{
 *   vercelProject: string
 *   baseUrl: string
 *   outputPath: string
 *   runs: number
 *   editTarget: string
 *   guideEmail: string
 * }} params
 */
export function buildWorkflowPlan(params) {
  return {
    vercelProject: params.vercelProject,
    environment: VERCEL_ENV_TARGET,
    envVar: DEBUG_ENV_VAR,
    envValue: DEBUG_ENV_VALUE,
    baseUrl: params.baseUrl,
    outputPath: params.outputPath,
    runs: params.runs,
    editTarget: params.editTarget,
    guideEmail: params.guideEmail,
    redeployCount: 2,
    measurementAction: 'draft_save_only (임시저장)',
    excludedActions: [
      'submit',
      'pay',
      'approve',
      'reopen',
      'recall',
      'send_for_confirmation',
      'field_mutation',
    ],
    steps: [
      `Enable ${DEBUG_ENV_VAR}=${DEBUG_ENV_VALUE} on Vercel Production (${params.vercelProject})`,
      'Redeploy Production (1/2) and wait until Ready',
      'Run measure-settlement-save-performance.mjs',
      `Write JSON to ${params.outputPath}`,
      `Remove ${DEBUG_ENV_VAR} from Vercel Production`,
      'Redeploy Production (2/2) and wait until Ready',
      'Print workflow summary',
    ],
  }
}

/**
 * @param {{
 *   vercelProject: string
 *   phase: 'enable' | 'disable' | 'redeploy' | 'measure'
 *   deploymentUrl?: string
 * }} params
 */
export function buildManualVercelCommands(params) {
  const project = params.vercelProject
  const commands = []

  if (params.phase === 'enable' || params.phase === 'disable') {
    if (params.phase === 'enable') {
      commands.push(
        `vercel link --yes --project ${project}`,
        `vercel env add ${DEBUG_ENV_VAR} ${VERCEL_ENV_TARGET} --value "${DEBUG_ENV_VALUE}" --yes --no-sensitive --force`,
      )
    } else {
      commands.push(
        `vercel link --yes --project ${project}`,
        `vercel env rm ${DEBUG_ENV_VAR} ${VERCEL_ENV_TARGET} --yes`,
      )
    }
  }

  if (params.phase === 'redeploy') {
    const target = params.deploymentUrl || '<latest-production-deployment-url>'
    commands.push(`vercel redeploy ${target}`)
  }

  if (params.phase === 'measure') {
    commands.push('npm run measure:settlement-save')
  }

  return commands
}

/**
 * @param {{
 *   vercelProject: string
 *   debugEnvEnabled: boolean
 *   cleanupAttempted: boolean
 *   cleanupSucceeded: boolean
 *   measurementSucceeded: boolean
 *   errors?: string[]
 * }} state
 */
export function buildCleanupPlan(state) {
  const actions = []
  const warnings = []

  if (state.debugEnvEnabled) {
    actions.push({
      action: 'remove_env',
      command: `vercel env rm ${DEBUG_ENV_VAR} ${VERCEL_ENV_TARGET} --yes`,
      project: state.vercelProject,
    })
    actions.push({
      action: 'redeploy_production',
      command: 'vercel redeploy <latest-production-deployment-url>',
      project: state.vercelProject,
    })
  }

  if (!state.cleanupAttempted) {
    warnings.push(
      `Cleanup was not attempted. Manually remove ${DEBUG_ENV_VAR} from Vercel Production (${state.vercelProject}) and redeploy.`,
    )
  } else if (!state.cleanupSucceeded) {
    warnings.push(
      `Cleanup failed. Manually remove ${DEBUG_ENV_VAR} from Vercel Production (${state.vercelProject}) and redeploy.`,
    )
    for (const cmd of buildManualVercelCommands({ vercelProject: state.vercelProject, phase: 'disable' })) {
      warnings.push(`  ${cmd}`)
    }
  }

  if (!state.measurementSucceeded) {
    warnings.push('Measurement did not complete successfully; review logs and artifacts.')
  }

  if (state.errors?.length) {
    for (const err of state.errors) warnings.push(err)
  }

  return { actions, warnings }
}

/**
 * @param {unknown} report
 */
export function parseMeasurementReport(report) {
  if (!report || typeof report !== 'object') {
    return {
      ok: false,
      saveTimingDebugEnabled: null,
      browserDurationP50: undefined,
      totalMsP50: undefined,
      warningCount: 0,
      warnings: [],
    }
  }

  const r = /** @type {Record<string, unknown>} */ (report)
  const meta = /** @type {Record<string, unknown>} */ (r.meta ?? {})
  const summary = /** @type {Record<string, Record<string, unknown>>>} */ (r.summary ?? {})
  const warnings = Array.isArray(r.warnings) ? r.warnings.map(String) : []

  return {
    ok: true,
    saveTimingDebugEnabled:
      typeof meta.saveTimingDebugEnabled === 'boolean' ? meta.saveTimingDebugEnabled : null,
    measuredAt: typeof meta.measuredAt === 'string' ? meta.measuredAt : undefined,
    editPath: typeof meta.editPath === 'string' ? meta.editPath : undefined,
    runCount: typeof meta.runCount === 'number' ? meta.runCount : undefined,
    browserDurationP50: num(summary.browserDurationMs?.p50),
    browserDurationMax: num(summary.browserDurationMs?.max),
    totalMsP50: num(summary.totalMs?.p50),
    totalMsMax: num(summary.totalMs?.max),
    postSaveReloadP50: num(summary.postSaveReloadTotalMs?.p50),
    warningCount: warnings.length,
    warnings,
    warningFlags:
      r.warningFlags && typeof r.warningFlags === 'object'
        ? /** @type {Record<string, boolean>} */ (r.warningFlags)
        : {},
  }
}

/**
 * @param {{
 *   plan: ReturnType<typeof buildWorkflowPlan>
 *   startedAt: string
 *   finishedAt: string
 *   debugEnvEnabled: boolean
 *   debugEnvRemoved: boolean
 *   redeploys: Array<{ label: string; url?: string; state?: string; ok: boolean }>
 *   measurement: ReturnType<typeof parseMeasurementReport>
 *   outputPath: string
 *   cleanupWarnings: string[]
 * }} params
 */
export function buildFinalSummary(params) {
  return {
    workflow: 'settlement-save-performance',
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    vercelProject: params.plan.vercelProject,
    environment: params.plan.environment,
    debugEnvVar: DEBUG_ENV_VAR,
    debugEnvEnabledDuringMeasurement: params.debugEnvEnabled,
    debugEnvRemovedAfterMeasurement: params.debugEnvRemoved,
    redeploys: params.redeploys,
    measurementOutput: params.outputPath,
    measurement: params.measurement,
    cleanupWarnings: params.cleanupWarnings,
    safety: {
      onlyDraftSave: true,
      excludedActions: params.plan.excludedActions,
      credentialsSource: 'env_only',
      noAppBusinessLogicChanges: true,
    },
  }
}

/**
 * @param {string} text
 */
export function sanitizeCliOutput(text) {
  if (!text) return ''
  return text
    .replace(/vercel_[a-zA-Z0-9_]+/g, '[vercel-token-redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/(password|token|secret)\s*[:=]\s*\S+/gi, '$1=[redacted]')
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
