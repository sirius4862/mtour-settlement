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
  totalMs: number
  totalRequests: number
  lineItemRequests?: number
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

export function buildSaveDebugTimings(params: {
  steps: SettlementSaveTiming[]
  lineItemRequests?: number
  preLoad?: GetSettlementFullTimingLog
  postSaveReload?: GetSettlementFullTimingLog
}): SaveDebugTimings {
  const totalMs = params.steps.reduce((sum, step) => sum + step.ms, 0)
  const totalRequests = params.steps.reduce((sum, step) => sum + (step.requestCount ?? 0), 0)

  return {
    deploySha: getDeployShaForDebug(),
    totalMs,
    totalRequests,
    lineItemRequests: params.lineItemRequests,
    preLoad: params.preLoad
      ? sanitizeGetSettlementFullTimingForDebug(params.preLoad)
      : undefined,
    postSaveReload: params.postSaveReload
      ? sanitizeGetSettlementFullTimingForDebug(params.postSaveReload)
      : undefined,
    steps: params.steps.map(
      ({ step, ms, table, requestCount, deleteIds, inserts, updates, updatesSkipped }) => ({
        step,
        ms,
        table,
        requestCount,
        deleteIds,
        inserts,
        updates,
        updatesSkipped,
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
