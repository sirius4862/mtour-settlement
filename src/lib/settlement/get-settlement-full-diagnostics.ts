export type GetSettlementFullCallPurpose =
  | 'pre_load'
  | 'pre_load_line_items'
  | 'post_save_reload'
  | 'page_load'
  | 'calc_summary_fallback'
  | 'unknown'

export type GetSettlementFullQueryTiming = {
  query: string
  ms: number
  /** Ms after parallel batch start when this query was issued. */
  startedOffsetMs: number
}

export type GetSettlementFullTimingLog = {
  settlementId: string
  callPurpose: GetSettlementFullCallPurpose
  totalMs: number
  settlementQueryMs: number
  parallelBatchMs: number
  queryCount: number
  queries: GetSettlementFullQueryTiming[]
  sumQueryMs: number
  parallelismRatio: number
  appearsParallel: boolean
}

const PARALLEL_RATIO_THRESHOLD = 1.3

export function createGetSettlementFullTimer() {
  const queries: GetSettlementFullQueryTiming[] = []
  let batchAnchor = 0

  const timedQuery = async <T>(query: string, task: () => PromiseLike<T>): Promise<T> => {
    const startedOffsetMs =
      batchAnchor > 0 ? Math.max(0, Math.round(performance.now() - batchAnchor)) : 0
    const started = performance.now()
    try {
      return await task()
    } finally {
      queries.push({
        query,
        ms: Math.round(performance.now() - started),
        startedOffsetMs,
      })
    }
  }

  const startParallelBatch = () => {
    batchAnchor = performance.now()
  }

  const endParallelBatch = () => {
    const elapsed = batchAnchor > 0 ? Math.round(performance.now() - batchAnchor) : 0
    batchAnchor = 0
    return elapsed
  }

  return {
    queries,
    timedQuery,
    startParallelBatch,
    endParallelBatch,
  }
}

export function buildGetSettlementFullTimingLog(params: {
  settlementId: string
  callPurpose: GetSettlementFullCallPurpose
  settlementQueryMs: number
  parallelBatchMs: number
  parallelQueries: GetSettlementFullQueryTiming[]
  extraQueryMs?: number
}): GetSettlementFullTimingLog {
  const settlementEntry: GetSettlementFullQueryTiming = {
    query: 'settlements',
    ms: params.settlementQueryMs,
    startedOffsetMs: 0,
  }
  const queries = [settlementEntry, ...params.parallelQueries]
  if (params.extraQueryMs != null && params.extraQueryMs > 0) {
    queries.push({
      query: 'company_expense_items',
      ms: params.extraQueryMs,
      startedOffsetMs: params.parallelBatchMs,
    })
  }

  const parallelQueryMs = params.parallelQueries.reduce((sum, q) => sum + q.ms, 0)
  const sumQueryMs =
    params.settlementQueryMs + parallelQueryMs + (params.extraQueryMs ?? 0)
  const parallelDenominator = Math.max(
    params.parallelBatchMs,
    ...params.parallelQueries.map((q) => q.startedOffsetMs + q.ms),
    1,
  )
  const parallelismRatio = Math.round((sumQueryMs / parallelDenominator) * 100) / 100

  return {
    settlementId: params.settlementId,
    callPurpose: params.callPurpose,
    totalMs:
      params.settlementQueryMs +
      params.parallelBatchMs +
      (params.extraQueryMs ?? 0),
    settlementQueryMs: params.settlementQueryMs,
    parallelBatchMs: params.parallelBatchMs,
    queryCount: queries.length,
    queries,
    sumQueryMs,
    parallelismRatio,
    appearsParallel: parallelismRatio >= PARALLEL_RATIO_THRESHOLD,
  }
}

/** Dev/server timing log — settlement id only; no row payloads or PII. */
export function logGetSettlementFullTimings(log: GetSettlementFullTimingLog): void {
  console.info('[getSettlementFull] timings', log)
}
