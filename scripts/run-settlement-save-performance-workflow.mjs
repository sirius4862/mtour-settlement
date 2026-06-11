#!/usr/bin/env node
/**
 * Full settlement save performance workflow:
 * enable SAVE_TIMING_DEBUG on Vercel Production → redeploy → measure → cleanup → redeploy.
 *
 * Modifies Vercel Production env — requires explicit confirmation.
 * Does not change app business logic.
 */
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildCleanupPlan,
  buildFinalSummary,
  buildManualVercelCommands,
  buildWorkflowPlan,
  DEBUG_ENV_VAR,
  DEBUG_ENV_VALUE,
  parseMeasurementReport,
  resolveWorkflowVercelProject,
  sanitizeCliOutput,
  validateWorkflowEnv,
  VERCEL_ENV_TARGET,
} from './lib/settlement-save-workflow.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const MEASURE_SCRIPT = join(__dirname, 'measure-settlement-save-performance.mjs')
const VERCEL_DIR = join(REPO_ROOT, '.vercel')
const PROJECT_JSON_PATH = join(VERCEL_DIR, 'project.json')

function loadEnvLocal() {
  const p = join(REPO_ROOT, '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
}

function readProjectJson() {
  if (!existsSync(PROJECT_JSON_PATH)) return null
  try {
    return JSON.parse(readFileSync(PROJECT_JSON_PATH, 'utf8'))
  } catch {
    return null
  }
}

function restoreProjectJson(snapshot) {
  if (!snapshot) return
  mkdirSync(VERCEL_DIR, { recursive: true })
  writeFileSync(PROJECT_JSON_PATH, snapshot, 'utf8')
}

async function askYesNo(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) => {
    rl.question(prompt, (value) => resolve(value))
  })
  rl.close()
  return answer.trim() === 'YES'
}

async function waitForEnter(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  await new Promise((resolve) => {
    rl.question(prompt, () => resolve())
  })
  rl.close()
}

function logStep(message) {
  console.log(`[workflow] ${message}`)
}

function logWarn(message) {
  console.warn(`[workflow] WARNING: ${message}`)
}

async function runCommand(command, args, options = {}) {
  const { cwd = REPO_ROOT, env = process.env, label = command } = options
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
        label,
      })
    })
  })
}

async function runVercel(args, label) {
  const result = await runCommand('npx', ['vercel', ...args], { label: label ?? `vercel ${args.join(' ')}` })
  if (result.code !== 0) {
    const message = sanitizeCliOutput(`${result.stderr}\n${result.stdout}`.trim())
    throw new Error(`${result.label} failed (exit ${result.code}): ${message || 'unknown error'}`)
  }
  return result
}

async function ensureVercelProjectLinked(targetProject) {
  const current = readProjectJson()
  if (current?.projectName === targetProject) return

  logStep(`Linking Vercel project "${targetProject}" (restoring previous link afterward)`)
  await runVercel(['link', '--yes', '--project', targetProject], 'vercel link')
}

async function envVarExists(name) {
  const result = await runCommand('npx', ['vercel', 'env', 'list', VERCEL_ENV_TARGET], {
    label: 'vercel env list',
  })
  if (result.code !== 0) return false
  const output = `${result.stdout}\n${result.stderr}`
  return new RegExp(`^\\s*${name}\\s`, 'mi').test(output) || output.includes(name)
}

async function enableDebugEnv() {
  await runVercel(
    [
      'env',
      'add',
      DEBUG_ENV_VAR,
      VERCEL_ENV_TARGET,
      '--value',
      DEBUG_ENV_VALUE,
      '--yes',
      '--no-sensitive',
      '--force',
    ],
    'vercel env add SAVE_TIMING_DEBUG',
  )
}

async function disableDebugEnv() {
  await runVercel(
    ['env', 'rm', DEBUG_ENV_VAR, VERCEL_ENV_TARGET, '--yes'],
    'vercel env rm SAVE_TIMING_DEBUG',
  )
}

async function getLatestProductionDeployment(projectName) {
  const result = await runVercel(
    ['ls', projectName, '--prod', '-F', 'json'],
    'vercel ls production json',
  )
  const json = JSON.parse(result.stdout)
  const deployments = Array.isArray(json.deployments) ? json.deployments : []
  const ready = deployments.find((d) => d?.target === 'production' && d?.state === 'READY')
  if (!ready?.url) {
    throw new Error(`No Ready production deployment found for project ${projectName}`)
  }
  return ready
}

async function redeployProduction(projectName, label) {
  const current = await getLatestProductionDeployment(projectName)
  const deploymentUrl = current.url
  logStep(`${label}: redeploying ${deploymentUrl}`)
  const result = await runVercel(['redeploy', deploymentUrl], `vercel redeploy (${label})`)
  const combined = `${result.stdout}\n${result.stderr}`
  const urlMatch = combined.match(/https?:\/\/[^\s]+/)
  return {
    sourceUrl: deploymentUrl,
    redeployUrl: urlMatch?.[0] ?? deploymentUrl,
    stdout: sanitizeCliOutput(combined),
  }
}

async function waitForProductionReady(projectName, sinceMs, timeoutMs = 600_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const result = await runCommand('npx', ['vercel', 'ls', projectName, '--prod', '-F', 'json'], {
      label: 'vercel ls wait',
    })
    if (result.code === 0) {
      try {
        const json = JSON.parse(result.stdout)
        const deployments = Array.isArray(json.deployments) ? json.deployments : []
        const candidate = deployments.find(
          (d) =>
            d?.target === 'production' &&
            d?.state === 'READY' &&
            typeof d?.createdAt === 'number' &&
            d.createdAt >= sinceMs - 5000,
        )
        if (candidate?.url) {
          return { url: candidate.url, state: candidate.state, createdAt: candidate.createdAt }
        }
      } catch {
        // keep polling
      }
    }
    await new Promise((r) => setTimeout(r, 10_000))
  }
  throw new Error(`Timed out waiting for production deployment Ready (${projectName})`)
}

async function runMeasurementScript(config) {
  const env = { ...process.env }
  env.PERF_BASE_URL = config.baseUrl
  env.PERF_GUIDE_EMAIL = config.guideEmail
  env.PERF_RUNS = String(config.runs)
  env.PERF_OUTPUT = config.outputPath
  if (config.editUrl) env.PERF_SETTLEMENT_EDIT_URL = config.editUrl
  if (config.tourCode) env.PERF_TOUR_CODE = config.tourCode
  if (config.headed) env.PERF_HEADED = '1'

  const result = await runCommand('node', [MEASURE_SCRIPT], {
    label: 'measure-settlement-save-performance',
    env,
  })
  if (result.code !== 0) {
    const message = sanitizeCliOutput(`${result.stderr}\n${result.stdout}`.trim())
    throw new Error(`Measurement script failed (exit ${result.code}): ${message || 'unknown error'}`)
  }
  return sanitizeCliOutput(result.stdout)
}

function readMeasurementReport(outputPath) {
  const absolute = join(REPO_ROOT, outputPath)
  if (!existsSync(absolute)) {
    throw new Error(`Measurement output not found: ${outputPath}`)
  }
  return JSON.parse(readFileSync(absolute, 'utf8'))
}

async function runSemiAutoStep(commands, prompt) {
  console.log('\n[workflow] Semi-automated step — run these commands manually:')
  for (const cmd of commands) console.log(`  ${cmd}`)
  await waitForEnter(`${prompt}\nPress Enter when done... `)
}

async function main() {
  loadEnvLocal()

  const validation = validateWorkflowEnv(process.env)
  if (!validation.ok) {
    throw new Error(`Missing required env:\n  - ${validation.errors.join('\n  - ')}`)
  }

  const projectJson = readProjectJson()
  const vercelProject = resolveWorkflowVercelProject(process.env, projectJson)
  if (!vercelProject) {
    throw new Error(
      'Could not resolve Vercel project. Set WORKFLOW_VERCEL_PROJECT or link .vercel/project.json',
    )
  }

  const { config } = validation
  const plan = buildWorkflowPlan({
    vercelProject,
    baseUrl: config.baseUrl,
    outputPath: config.outputPath,
    runs: config.runs,
    editTarget: config.editTarget,
    guideEmail: config.guideEmail,
  })

  console.log('\n=== Settlement save performance workflow ===\n')
  console.log(`Target Vercel project: ${plan.vercelProject}`)
  console.log(`Target environment:    ${plan.environment}`)
  console.log(`Env var to enable:     ${plan.envVar}=${plan.envValue}`)
  console.log(`Production redeploys:  ${plan.redeployCount}`)
  console.log(`Measurement URL:       ${plan.baseUrl}`)
  console.log(`Edit target:           ${plan.editTarget}`)
  console.log(`Guide email:           ${plan.guideEmail}`)
  console.log(`Runs:                  ${plan.runs}`)
  console.log(`Output:                ${plan.outputPath}`)
  console.log(`Measurement action:    ${plan.measurementAction}`)
  console.log(`Excluded actions:      ${plan.excludedActions.join(', ')}`)
  console.log('\nPlanned steps:')
  for (const [i, step] of plan.steps.entries()) {
    console.log(`  ${i + 1}. ${step}`)
  }
  console.log('')

  if (!config.autoConfirm) {
    const confirmed = await askYesNo(
      'This will modify Vercel Production environment variables and redeploy twice.\nType YES to proceed: ',
    )
    if (!confirmed) {
      console.log('[workflow] Aborted — no changes made.')
      process.exit(0)
    }
  } else {
    logWarn('WORKFLOW_AUTO_CONFIRM=YES — skipping interactive confirmation')
  }

  const startedAt = new Date().toISOString()
  const workflowState = {
    debugEnvEnabled: false,
    debugEnvRemoved: false,
    cleanupAttempted: false,
    cleanupSucceeded: false,
    measurementSucceeded: false,
    errors: [],
  }
  const redeploys = []
  const projectJsonSnapshot = existsSync(PROJECT_JSON_PATH)
    ? readFileSync(PROJECT_JSON_PATH, 'utf8')
    : null
  let measurement = parseMeasurementReport(null)

  try {
    await ensureVercelProjectLinked(vercelProject)

    if (config.semiAuto) {
      await runSemiAutoStep(
        buildManualVercelCommands({ vercelProject, phase: 'enable' }),
        'Step 1/4: enable SAVE_TIMING_DEBUG',
      )
    } else {
      logStep(`Enabling ${DEBUG_ENV_VAR}=${DEBUG_ENV_VALUE} on Production`)
      await enableDebugEnv()
    }
    workflowState.debugEnvEnabled = true

    const redeploy1Start = Date.now()
    if (config.semiAuto) {
      await runSemiAutoStep(
        buildManualVercelCommands({ vercelProject, phase: 'redeploy' }),
        'Step 2/4: redeploy Production with debug enabled',
      )
      redeploys.push({ label: 'enable-debug', ok: true })
    } else {
      const redeploy1 = await redeployProduction(vercelProject, 'Redeploy 1/2')
      const ready1 = await waitForProductionReady(vercelProject, redeploy1Start)
      redeploys.push({
        label: 'enable-debug',
        url: ready1.url,
        state: ready1.state,
        ok: true,
      })
      logStep(`Redeploy 1/2 Ready: ${ready1.url}`)
    }

    if (config.semiAuto) {
      await runSemiAutoStep(
        buildManualVercelCommands({ vercelProject, phase: 'measure' }),
        'Step 3/4: run measurement script',
      )
    } else {
      logStep('Running measurement script (draft save only)')
      const measureStdout = await runMeasurementScript(config)
      if (measureStdout) console.log(measureStdout)
    }

    const report = readMeasurementReport(config.outputPath)
    measurement = parseMeasurementReport(report)
    workflowState.measurementSucceeded = measurement.ok

    if (config.semiAuto) {
      await runSemiAutoStep(
        buildManualVercelCommands({ vercelProject, phase: 'disable' }),
        'Step 4/4: remove SAVE_TIMING_DEBUG',
      )
      workflowState.cleanupAttempted = true
      workflowState.cleanupSucceeded = true
      workflowState.debugEnvRemoved = true
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    workflowState.errors.push(message)
    logWarn(message)
  } finally {
    workflowState.cleanupAttempted = true
    try {
      if (!config.semiAuto && workflowState.debugEnvEnabled) {
        logStep(`Removing ${DEBUG_ENV_VAR} from Production`)
        try {
          await disableDebugEnv()
          workflowState.debugEnvRemoved = true
        } catch (removeErr) {
          const exists = await envVarExists(DEBUG_ENV_VAR).catch(() => false)
          if (!exists) {
            workflowState.debugEnvRemoved = true
            logStep(`${DEBUG_ENV_VAR} already absent from Production`)
          } else {
            throw removeErr
          }
        }

        const redeploy2Start = Date.now()
        const redeploy2 = await redeployProduction(vercelProject, 'Redeploy 2/2')
        const ready2 = await waitForProductionReady(vercelProject, redeploy2Start)
        redeploys.push({
          label: 'disable-debug',
          url: ready2.url,
          state: ready2.state,
          ok: true,
        })
        logStep(`Redeploy 2/2 Ready: ${ready2.url}`)
      }
      workflowState.cleanupSucceeded = workflowState.debugEnvRemoved
    } catch (cleanupErr) {
      const message = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
      workflowState.errors.push(`Cleanup failed: ${message}`)
      logWarn(message)
      logWarn(
        `Manually remove ${DEBUG_ENV_VAR} from Vercel Production (${vercelProject}) and redeploy.`,
      )
      for (const cmd of buildManualVercelCommands({ vercelProject, phase: 'disable' })) {
        console.warn(`  ${cmd}`)
      }
    } finally {
      restoreProjectJson(projectJsonSnapshot)
    }
  }

  const finishedAt = new Date().toISOString()
  const cleanup = buildCleanupPlan({
    vercelProject,
    debugEnvEnabled: workflowState.debugEnvEnabled && !workflowState.debugEnvRemoved,
    cleanupAttempted: workflowState.cleanupAttempted,
    cleanupSucceeded: workflowState.cleanupSucceeded,
    measurementSucceeded: workflowState.measurementSucceeded,
    errors: workflowState.errors,
  })

  const summary = buildFinalSummary({
    plan,
    startedAt,
    finishedAt,
    debugEnvEnabled: workflowState.debugEnvEnabled,
    debugEnvRemoved: workflowState.debugEnvRemoved,
    redeploys,
    measurement,
    outputPath: config.outputPath,
    cleanupWarnings: cleanup.warnings,
  })

  const summaryPath = join(REPO_ROOT, 'artifacts', 'settlement-save-workflow-summary.json')
  mkdirSync(dirname(summaryPath), { recursive: true })
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

  console.log('\n=== Workflow summary ===\n')
  console.log(`Measurement output: ${config.outputPath}`)
  console.log(`Workflow summary:   ${summaryPath}`)
  console.log(`Debug enabled:      ${summary.debugEnvEnabledDuringMeasurement}`)
  console.log(`Debug removed:      ${summary.debugEnvRemovedAfterMeasurement}`)
  console.log(
    `Browser p50/max:    ${measurement.browserDurationP50 ?? 'n/a'} / ${measurement.browserDurationMax ?? 'n/a'} ms`,
  )
  console.log(
    `Server total p50/max: ${measurement.totalMsP50 ?? 'n/a'} / ${measurement.totalMsMax ?? 'n/a'} ms`,
  )
  console.log(`Warnings:           ${measurement.warningCount}`)
  if (cleanup.warnings.length) {
    console.log('\nCleanup / follow-up warnings:')
    for (const w of cleanup.warnings) console.log(`  - ${w}`)
  }
  if (measurement.saveTimingDebugEnabled === false) {
    logWarn('_debugTimings were not captured — verify SAVE_TIMING_DEBUG was enabled and redeploy completed.')
  }

  if (workflowState.errors.length > 0 || !workflowState.cleanupSucceeded) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[workflow] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
