/**
 * Pure parser/summary helpers for settlement save performance measurement.
 * No secrets, no I/O — safe to unit test from Vitest.
 */

/** @typedef {import('../../src/lib/settlement/save-timing-debug.ts').SaveDebugTimings} SaveDebugTimings */

const WARNING_THRESHOLDS = {
  totalMs: 5000,
  postSaveReloadTotalMs: 1000,
  totalRequests: 100,
}

const CHILD_COUNT_TABLES = [
  'hotel_items',
  'meal_items',
  'entrance_items',
  'other_expense_items',
  'shopping_items',
  'option_items',
  'receipts',
]

/**
 * @param {unknown} value
 * @returns {value is SaveDebugTimings}
 */
export function isSaveDebugTimings(value) {
  if (!value || typeof value !== 'object') return false
  const o = /** @type {Record<string, unknown>} */ (value)
  const hasStepSum =
    typeof o.stepSumMs === 'number' || typeof o.totalMs === 'number'
  return hasStepSum && Array.isArray(o.steps)
}

/**
 * @param {unknown} value
 * @returns {SaveDebugTimings | null}
 */
export function parseDebugTimingsFromUnknown(value) {
  if (!value) return null
  if (isSaveDebugTimings(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return isSaveDebugTimings(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return null
}

/**
 * Extract a JSON object value after a key using brace balancing.
 * @param {string} text
 * @param {string} key
 */
export function extractJsonObjectAfterKey(text, key) {
  const patterns = [`"${key}":`, `'${key}':`, `${key}:`]
  let start = -1
  for (const pattern of patterns) {
    const idx = text.indexOf(pattern)
    if (idx !== -1) {
      start = idx + pattern.length
      break
    }
  }
  if (start === -1) return null

  while (start < text.length && /\s/.test(text[start])) start += 1
  if (text[start] !== '{') return null

  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escape) {
        escape = false
      } else if (ch === '\\') {
        escape = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth += 1
    if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        const slice = text.slice(start, i + 1)
        try {
          return JSON.parse(slice)
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/**
 * @param {string} text
 */
export function normalizeResponseTextForDebugParse(text) {
  return text.replace(/\\"/g, '"').replace(/\\n/g, '')
}

/**
 * @param {{ method: () => string; headers: () => Record<string, string> }} request
 */
export function isServerActionPostRequest(request) {
  if (request.method() !== 'POST') return false
  const headers = request.headers()
  return Object.entries(headers).some(
    ([key, value]) => key.toLowerCase() === 'next-action' && Boolean(value),
  )
}

/**
 * @param {string} text
 * @returns {SaveDebugTimings | null}
 */
export function parseDebugTimingsFromResponseText(text) {
  if (!text || typeof text !== 'string') return null

  const candidates = [text, normalizeResponseTextForDebugParse(text)]
  for (const candidate of candidates) {
    const direct = extractJsonObjectAfterKey(candidate, '_debugTimings')
    const parsed = parseDebugTimingsFromUnknown(direct)
    if (parsed) return parsed
  }

  // Next.js server action flight line: e.g. 1:{"ok":true,"_debugTimings":{...}}
  const flightLine = text.match(/^\d+:\s*(\{[\s\S]*\})\s*$/m)
  if (flightLine) {
    try {
      const payload = JSON.parse(flightLine[1])
      if (payload?._debugTimings) {
        return parseDebugTimingsFromUnknown(payload._debugTimings)
      }
    } catch {
      // fall through
    }
  }

  if (text.includes('_debugTimings')) {
    const idx = text.indexOf('_debugTimings')
    const slice = text.slice(Math.max(0, idx - 2), idx + 20000)
    const parsed = parseDebugTimingsFromUnknown(extractJsonObjectAfterKey(slice, '_debugTimings'))
    if (parsed) return parsed
  }

  return null
}

/**
 * @param {string} text
 * @returns {SaveDebugTimings | null}
 */
export function parseDebugTimingsFromConsoleText(text) {
  if (!text || typeof text !== 'string') return null
  const prefix = '[settlement-form-action]'
  const idx = text.indexOf(prefix)
  if (idx === -1) return null
  const payload = text.slice(idx + prefix.length).trim()
  if (!payload || payload === '[object Object]') return null
  try {
    const parsed = JSON.parse(payload)
    return parseDebugTimingsFromUnknown(parsed?.debugTimings)
  } catch {
    return null
  }
}

/**
 * @param {SaveDebugTimings} debug
 */
export function aggregateStepCounts(debug) {
  let inserts = 0
  let deletes = 0
  let updatesSkipped = 0
  let revalidatePathsMs = 0

  for (const step of debug.steps) {
    inserts += step.inserts ?? 0
    deletes += step.deleteIds ?? 0
    updatesSkipped += step.updatesSkipped ?? 0
    if (step.step === 'revalidate_paths') {
      revalidatePathsMs += step.ms
    }
  }

  return { inserts, deletes, updatesSkipped, revalidatePathsMs }
}

/**
 * @param {SaveDebugTimings | null | undefined} debug
 */
export function extractRunMetrics(debug) {
  if (!debug) {
    return {
      actionWallMs: undefined,
      stepSumMs: undefined,
      effectiveStepSumMs: undefined,
      overlappedStepMs: undefined,
      parallelGroupWallMs: undefined,
      totalMs: undefined,
      preLoadTotalMs: undefined,
      postSaveReloadTotalMs: undefined,
      lineItemRequests: undefined,
      totalRequests: undefined,
      updatesSkipped: undefined,
      inserts: undefined,
      deletes: undefined,
      revalidatePathsMs: undefined,
      deploySha: undefined,
    }
  }

  const counts = aggregateStepCounts(debug)
  const stepSumMs = debug.stepSumMs ?? debug.totalMs
  return {
    actionWallMs: debug.actionWallMs,
    stepSumMs,
    effectiveStepSumMs: debug.effectiveStepSumMs,
    overlappedStepMs: debug.overlappedStepMs,
    parallelGroupWallMs: debug.parallelGroupWallMs,
    totalMs: stepSumMs,
    preLoadTotalMs: debug.preLoad?.totalMs,
    postSaveReloadTotalMs: debug.postSaveReload?.totalMs,
    lineItemRequests: debug.lineItemRequests,
    totalRequests: debug.totalRequests,
    updatesSkipped: counts.updatesSkipped,
    inserts: counts.inserts,
    deletes: counts.deletes,
    revalidatePathsMs: counts.revalidatePathsMs,
    deploySha: debug.deploySha,
  }
}

/**
 * @param {number[]} values
 * @param {number} p 0–100
 */
export function percentile(values, p) {
  if (!values.length) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 1) return sorted[0]
  const rank = (p / 100) * (sorted.length - 1)
  const low = Math.floor(rank)
  const high = Math.ceil(rank)
  if (low === high) return sorted[low]
  const weight = rank - low
  return sorted[low] * (1 - weight) + sorted[high] * weight
}

/**
 * @param {Array<number | undefined>} values
 */
export function summarizeNumeric(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (!nums.length) {
    return { count: 0, avg: undefined, min: undefined, max: undefined, p50: undefined }
  }
  const sum = nums.reduce((a, b) => a + b, 0)
  return {
    count: nums.length,
    avg: Math.round((sum / nums.length) * 100) / 100,
    min: Math.min(...nums),
    max: Math.max(...nums),
    p50: Math.round(percentile(nums, 50) * 100) / 100,
  }
}

/**
 * @param {{
 *   browserDurationMs?: number
 *   serverResponseMs?: number
 *   extracted?: ReturnType<typeof extractRunMetrics>
 *   childRowCounts?: { before?: Record<string, number | null>, after?: Record<string, number | null> }
 *   noChangeResave?: boolean
 * }} run
 */
export function buildRunWarnings(run) {
  const warnings = []
  const extracted = run.extracted ?? {}
  const flags = {
    totalMsOver5000: false,
    postSaveReloadOver1000: false,
    totalRequestsOver100: false,
    insertsOnNoChangeResave: false,
    deletesOnNoChangeResave: false,
    childRowCountIncreased: false,
  }

  if (typeof extracted.totalMs === 'number' && extracted.totalMs > WARNING_THRESHOLDS.totalMs) {
    flags.totalMsOver5000 = true
    warnings.push(`totalMs ${extracted.totalMs}ms exceeds ${WARNING_THRESHOLDS.totalMs}ms`)
  }
  if (
    typeof extracted.postSaveReloadTotalMs === 'number' &&
    extracted.postSaveReloadTotalMs > WARNING_THRESHOLDS.postSaveReloadTotalMs
  ) {
    flags.postSaveReloadOver1000 = true
    warnings.push(
      `postSaveReload.totalMs ${extracted.postSaveReloadTotalMs}ms exceeds ${WARNING_THRESHOLDS.postSaveReloadTotalMs}ms`,
    )
  }
  if (
    typeof extracted.totalRequests === 'number' &&
    extracted.totalRequests > WARNING_THRESHOLDS.totalRequests
  ) {
    flags.totalRequestsOver100 = true
    warnings.push(
      `totalRequests ${extracted.totalRequests} exceeds ${WARNING_THRESHOLDS.totalRequests}`,
    )
  }

  if (run.noChangeResave !== false) {
    if (typeof extracted.inserts === 'number' && extracted.inserts > 0) {
      flags.insertsOnNoChangeResave = true
      warnings.push(`inserts ${extracted.inserts} on no-change re-save`)
    }
    if (typeof extracted.deletes === 'number' && extracted.deletes > 0) {
      flags.deletesOnNoChangeResave = true
      warnings.push(`deletes ${extracted.deletes} on no-change re-save`)
    }
  }

  const before = run.childRowCounts?.before
  const after = run.childRowCounts?.after
  if (before && after) {
    for (const table of CHILD_COUNT_TABLES) {
      const b = before[table]
      const a = after[table]
      if (typeof b === 'number' && typeof a === 'number' && a > b) {
        flags.childRowCountIncreased = true
        warnings.push(`child row count increased for ${table}: ${b} → ${a}`)
      }
    }
  }

  return { warnings, flags }
}

/**
 * @param {Array<{
 *   run: number
 *   browserDurationMs: number
 *   serverResponseMs?: number
 *   networkDebugTimings?: SaveDebugTimings | null
 *   consoleDebugTimings?: SaveDebugTimings | null
 *   childRowCounts?: { before?: Record<string, number | null>, after?: Record<string, number | null> }
 *   saveOk: boolean
 *   error?: string
 * }>} runs
 * @param {{
 *   baseUrl: string
 *   editPath: string
 *   settlementId?: string
 *   runCount: number
 *   measuredAt: string
 * }} meta
 */
export function buildMeasurementReport(runs, meta) {
  const normalizedRuns = runs.map((run) => {
    const debug = run.networkDebugTimings ?? run.consoleDebugTimings ?? null
    const extracted = extractRunMetrics(debug)
    const { warnings, flags } = buildRunWarnings({
      browserDurationMs: run.browserDurationMs,
      extracted,
      childRowCounts: run.childRowCounts,
      noChangeResave: true,
    })
    return {
      run: run.run,
      saveOk: run.saveOk,
      error: run.error,
      browserDurationMs: run.browserDurationMs,
      serverResponseMs: run.serverResponseMs,
      networkDebugTimings: run.networkDebugTimings ?? null,
      consoleDebugTimings: run.consoleDebugTimings ?? null,
      extracted,
      childRowCounts: run.childRowCounts ?? null,
      warnings,
      warningFlags: flags,
    }
  })

  const allWarnings = [...new Set(normalizedRuns.flatMap((r) => r.warnings))]
  const aggregateFlags = {
    totalMsOver5000: normalizedRuns.some((r) => r.warningFlags.totalMsOver5000),
    postSaveReloadOver1000: normalizedRuns.some((r) => r.warningFlags.postSaveReloadOver1000),
    totalRequestsOver100: normalizedRuns.some((r) => r.warningFlags.totalRequestsOver100),
    insertsOnNoChangeResave: normalizedRuns.some((r) => r.warningFlags.insertsOnNoChangeResave),
    deletesOnNoChangeResave: normalizedRuns.some((r) => r.warningFlags.deletesOnNoChangeResave),
    childRowCountIncreased: normalizedRuns.some((r) => r.warningFlags.childRowCountIncreased),
  }

  const hasDebugTimings = normalizedRuns.some(
    (r) => r.networkDebugTimings || r.consoleDebugTimings,
  )

  return {
    meta: {
      ...meta,
      saveTimingDebugEnabled: hasDebugTimings ? true : hasDebugTimings === false ? false : null,
      childCountTables: CHILD_COUNT_TABLES,
      thresholds: WARNING_THRESHOLDS,
      actionsPerformed: ['login', 'open_edit_page', 'draft_save_only'],
      actionsExcluded: [
        'submit',
        'pay',
        'approve',
        'reopen',
        'recall',
        'send_for_confirmation',
        'field_mutation',
      ],
    },
    runs: normalizedRuns,
    summary: {
      browserDurationMs: summarizeNumeric(normalizedRuns.map((r) => r.browserDurationMs)),
      serverResponseMs: summarizeNumeric(
        normalizedRuns.map((r) => r.serverResponseMs),
      ),
      actionWallMs: summarizeNumeric(normalizedRuns.map((r) => r.extracted.actionWallMs)),
      stepSumMs: summarizeNumeric(normalizedRuns.map((r) => r.extracted.stepSumMs)),
      effectiveStepSumMs: summarizeNumeric(
        normalizedRuns.map((r) => r.extracted.effectiveStepSumMs),
      ),
      totalMs: summarizeNumeric(normalizedRuns.map((r) => r.extracted.totalMs)),
      preLoadTotalMs: summarizeNumeric(normalizedRuns.map((r) => r.extracted.preLoadTotalMs)),
      postSaveReloadTotalMs: summarizeNumeric(
        normalizedRuns.map((r) => r.extracted.postSaveReloadTotalMs),
      ),
      lineItemRequests: summarizeNumeric(normalizedRuns.map((r) => r.extracted.lineItemRequests)),
      totalRequests: summarizeNumeric(normalizedRuns.map((r) => r.extracted.totalRequests)),
      updatesSkipped: summarizeNumeric(normalizedRuns.map((r) => r.extracted.updatesSkipped)),
      inserts: summarizeNumeric(normalizedRuns.map((r) => r.extracted.inserts)),
      deletes: summarizeNumeric(normalizedRuns.map((r) => r.extracted.deletes)),
      revalidatePathsMs: summarizeNumeric(
        normalizedRuns.map((r) => r.extracted.revalidatePathsMs),
      ),
    },
    warnings: allWarnings,
    warningFlags: aggregateFlags,
  }
}

export { CHILD_COUNT_TABLES, WARNING_THRESHOLDS }
