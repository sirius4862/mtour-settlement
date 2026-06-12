import type { GetSettlementFullTimingLog } from './get-settlement-full-diagnostics'
import type { SettlementSaveTiming } from './save-step-diagnostics'

export type SaveDebugGetSettlementFullTiming = {
  callPurpose: string
  totalMs: number
  settlementQueryMs: number
  parallelBatchMs: number
  queryCount: number
  queries: Array<{ query: string; ms: number }>
  sumQueryMs: number
  parallelismRatio: number
  appearsParallel: boolean
}

export type SaveDebugTimings = {
  deploySha?: string
  /** Wall-clock duration of the full saveSettlementDraft server action. */
  actionWallMs?: number
  /** Sum of all recorded step durations (may double-count overlapped parallel work). */
  stepSumMs: number
  /** Step sum excluding steps marked overlappedWith another step. */
  effectiveStepSumMs: number
  /** Milliseconds attributed to overlapped steps (subset of stepSumMs). */
  overlappedStepMs: number
  /**
   * @deprecated Prefer actionWallMs for real server wall time, or effectiveStepSumMs for
   * non-overlapped step totals. Kept for backward-compatible measurement parsers.
   */
  totalMs: number
  totalRequests: number
  lineItemRequests?: number
  /** Wall time of the edit-path parallel batch (header upsert + line-item pre-load). */
  parallelGroupWallMs?: number
  preLoad?: SaveDebugGetSettlementFullTiming
  postSaveReload?: SaveDebugGetSettlementFullTiming
  steps: Array<{
    step: string
    ms: number
    table?: string
    requestCount?: number
    deleteIds?: number
    inserts?: number
    updates?: number
    updatesSkipped?: number
    overlappedWith?: 'load_existing_settlement'
  }>
}

/** Server-only opt-in flag — never set in normal production. */
export function isSaveTimingDebugEnabled(): boolean {
  return process.env.SAVE_TIMING_DEBUG === '1'
}

export function getDeployShaForDebug(): string | undefined {
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_GIT_SHA ||
    process.env.NEXT_PUBLIC_DEPLOY_SHA ||
    ''
  return sha || undefined
}

export function sanitizeGetSettlementFullTimingForDebug(
  log: GetSettlementFullTimingLog,
): SaveDebugGetSettlementFullTiming {
  return {
    callPurpose: log.callPurpose,
    totalMs: log.totalMs,
    settlementQueryMs: log.settlementQueryMs,
    parallelBatchMs: log.parallelBatchMs,
    queryCount: log.queryCount,
    queries: log.queries.map(({ query, ms }) => ({ query, ms })),
    sumQueryMs: log.sumQueryMs,
    parallelismRatio: log.parallelismRatio,
    appearsParallel: log.appearsParallel,
  }
}

export function computeStepSums(steps: SettlementSaveTiming[]): {
  stepSumMs: number
  effectiveStepSumMs: number
  overlappedStepMs: number
} {
  let stepSumMs = 0
  let effectiveStepSumMs = 0
  let overlappedStepMs = 0
  for (const step of steps) {
    stepSumMs += step.ms
    if (step.overlappedWith) {
      overlappedStepMs += step.ms
    } else {
      effectiveStepSumMs += step.ms
    }
  }
  return { stepSumMs, effectiveStepSumMs, overlappedStepMs }
}

export function buildSaveDebugTimings(params: {
  steps: SettlementSaveTiming[]
  lineItemRequests?: number
  preLoad?: GetSettlementFullTimingLog
  postSaveReload?: GetSettlementFullTimingLog
  actionWallMs?: number
  parallelGroupWallMs?: number
}): SaveDebugTimings {
  const { stepSumMs, effectiveStepSumMs, overlappedStepMs } = computeStepSums(params.steps)
  const totalRequests = params.steps.reduce((sum, step) => sum + (step.requestCount ?? 0), 0)

  return {
    deploySha: getDeployShaForDebug(),
    actionWallMs: params.actionWallMs,
    stepSumMs,
    effectiveStepSumMs,
    overlappedStepMs,
    totalMs: stepSumMs,
    totalRequests,
    lineItemRequests: params.lineItemRequests,
    parallelGroupWallMs: params.parallelGroupWallMs,
    preLoad: params.preLoad
      ? sanitizeGetSettlementFullTimingForDebug(params.preLoad)
      : undefined,
    postSaveReload: params.postSaveReload
      ? sanitizeGetSettlementFullTimingForDebug(params.postSaveReload)
      : undefined,
    steps: params.steps.map(
      ({
        step,
        ms,
        table,
        requestCount,
        deleteIds,
        inserts,
        updates,
        updatesSkipped,
        overlappedWith,
      }) => ({
        step,
        ms,
        table,
        requestCount,
        deleteIds,
        inserts,
        updates,
        updatesSkipped,
        overlappedWith,
      }),
    ),
  }
}

export function attachSaveDebugTimings<T extends Record<string, unknown>>(
  result: T,
  debug?: SaveDebugTimings,
): T & { _debugTimings?: SaveDebugTimings } {
  if (!isSaveTimingDebugEnabled() || !debug) return result
  return { ...result, _debugTimings: debug }
}

/** Guard for tests — ensures debug payloads never leak PII or raw payloads. */
export function assertSaveDebugTimingsSanitized(debug: SaveDebugTimings): void {
  const json = JSON.stringify(debug).toLowerCase()
  const forbidden = [
    'guidename',
    'guide_name',
    'tourname',
    'tour_name',
    'tour_code',
    'customer',
    'receipt',
    'password',
    'token',
    'authorization',
    'service_role',
    'payload',
    'hotels',
    'meals',
    'entrances',
  ]
  for (const term of forbidden) {
    if (json.includes(term)) {
      throw new Error(`save debug timings must not include "${term}"`)
    }
  }
}
