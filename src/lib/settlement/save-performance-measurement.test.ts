import { describe, expect, it } from 'vitest'
import {
  buildMeasurementReport,
  buildRunWarnings,
  extractRunMetrics,
  isServerActionPostRequest,
  normalizeResponseTextForDebugParse,
  parseDebugTimingsFromConsoleText,
  parseDebugTimingsFromResponseText,
  parseDebugTimingsFromUnknown,
  percentile,
  summarizeNumeric,
} from '../../../scripts/lib/save-performance-summary.mjs'
import type { SaveDebugTimings } from './save-timing-debug'

const SAMPLE_DEBUG: SaveDebugTimings = {
  deploySha: 'abc123def456',
  totalMs: 4200,
  totalRequests: 42,
  lineItemRequests: 18,
  preLoad: {
    callPurpose: 'pre_load',
    totalMs: 800,
    settlementQueryMs: 120,
    parallelBatchMs: 650,
    queryCount: 8,
    queries: [{ query: 'hotel_items', ms: 90 }],
    sumQueryMs: 700,
    parallelismRatio: 1.1,
    appearsParallel: true,
  },
  postSaveReload: {
    callPurpose: 'post_save_reload',
    totalMs: 1500,
    settlementQueryMs: 200,
    parallelBatchMs: 1200,
    queryCount: 8,
    queries: [{ query: 'meal_items', ms: 110 }],
    sumQueryMs: 1300,
    parallelismRatio: 1.4,
    appearsParallel: true,
  },
  steps: [
    { step: 'upsert_settlement_header', ms: 120, requestCount: 1, updates: 1, updatesSkipped: 0 },
    {
      step: 'persist_line_items_table',
      ms: 900,
      table: 'hotel_items',
      requestCount: 6,
      inserts: 0,
      updates: 2,
      updatesSkipped: 4,
      deleteIds: 0,
    },
    { step: 'revalidate_paths', ms: 80, requestCount: 2 },
  ],
}

describe('save-performance-measurement', () => {
  it('parses _debugTimings from unknown and response text', () => {
    expect(parseDebugTimingsFromUnknown(SAMPLE_DEBUG)).toEqual(SAMPLE_DEBUG)
    expect(parseDebugTimingsFromUnknown(JSON.stringify(SAMPLE_DEBUG))).toEqual(SAMPLE_DEBUG)
    expect(parseDebugTimingsFromUnknown(null)).toBeNull()

    const responseBody = `0:["$","meta",{"_debugTimings":${JSON.stringify(SAMPLE_DEBUG)},"ok":true}]`
    expect(parseDebugTimingsFromResponseText(responseBody)).toEqual(SAMPLE_DEBUG)
  })

  it('parses debugTimings from settlement-form-action console payload', () => {
    const consoleLine = `[settlement-form-action] ${JSON.stringify({
      action: 'save_only',
      settlementId: '00000000-0000-4000-8000-000000000001',
      debugTimings: SAMPLE_DEBUG,
    })}`
    expect(parseDebugTimingsFromConsoleText(consoleLine)).toEqual(SAMPLE_DEBUG)
    expect(parseDebugTimingsFromConsoleText('[settlement-form-action] [object Object]')).toBeNull()
  })

  it('parses escaped and flight-line server action responses', () => {
    const flightLine = `1:${JSON.stringify({ ok: true, _debugTimings: SAMPLE_DEBUG })}`
    expect(parseDebugTimingsFromResponseText(flightLine)).toEqual(SAMPLE_DEBUG)

    const escaped = `0:{\\"_debugTimings\\":${JSON.stringify(SAMPLE_DEBUG).replace(/"/g, '\\"')}}`
    expect(parseDebugTimingsFromResponseText(escaped)).toEqual(SAMPLE_DEBUG)
    expect(normalizeResponseTextForDebugParse(escaped)).toContain('"_debugTimings"')
  })

  it('detects Next.js server action POST requests', () => {
    expect(
      isServerActionPostRequest({
        method: () => 'POST',
        headers: () => ({ 'next-action': 'abc123' }),
      }),
    ).toBe(true)
    expect(
      isServerActionPostRequest({
        method: () => 'GET',
        headers: () => ({ 'next-action': 'abc123' }),
      }),
    ).toBe(false)
  })

  it('computes avg/min/max/p50', () => {
    expect(summarizeNumeric([100, 200, 300, 400])).toEqual({
      count: 4,
      avg: 250,
      min: 100,
      max: 400,
      p50: 250,
    })
    expect(percentile([10, 20, 30, 40, 1000], 50)).toBe(30)
    expect(summarizeNumeric([undefined, Number.NaN])).toEqual({
      count: 0,
      avg: undefined,
      min: undefined,
      max: undefined,
      p50: undefined,
    })
  })

  it('extracts run metrics and flags warnings', () => {
    const extracted = extractRunMetrics(SAMPLE_DEBUG)
    expect(extracted.totalMs).toBe(4200)
    expect(extracted.preLoadTotalMs).toBe(800)
    expect(extracted.postSaveReloadTotalMs).toBe(1500)
    expect(extracted.lineItemRequests).toBe(18)
    expect(extracted.totalRequests).toBe(42)
    expect(extracted.updatesSkipped).toBe(4)
    expect(extracted.inserts).toBe(0)
    expect(extracted.deletes).toBe(0)
    expect(extracted.revalidatePathsMs).toBe(80)

    const { warnings, flags } = buildRunWarnings({
      extracted,
      childRowCounts: {
        before: { hotel_items: 2, meal_items: 1 },
        after: { hotel_items: 3, meal_items: 1 },
      },
    })
    expect(flags.postSaveReloadOver1000).toBe(true)
    expect(flags.childRowCountIncreased).toBe(true)
    expect(warnings.some((w) => w.includes('postSaveReload'))).toBe(true)
    expect(warnings.some((w) => w.includes('hotel_items'))).toBe(true)
  })

  it('flags inserts/deletes on no-change re-save', () => {
    const debug: SaveDebugTimings = {
      ...SAMPLE_DEBUG,
      steps: [
        {
          step: 'persist_line_items_table',
          ms: 50,
          table: 'other_expense_items',
          requestCount: 2,
          inserts: 1,
          deleteIds: 1,
        },
      ],
    }
    const { flags } = buildRunWarnings({ extracted: extractRunMetrics(debug) })
    expect(flags.insertsOnNoChangeResave).toBe(true)
    expect(flags.deletesOnNoChangeResave).toBe(true)
  })

  it('builds measurement report without secrets in code', () => {
    const report = buildMeasurementReport(
      [
        {
          run: 1,
          browserDurationMs: 5100,
          networkDebugTimings: SAMPLE_DEBUG,
          consoleDebugTimings: SAMPLE_DEBUG,
          saveOk: true,
        },
        {
          run: 2,
          browserDurationMs: 4800,
          networkDebugTimings: { ...SAMPLE_DEBUG, totalMs: 3900 },
          saveOk: true,
        },
      ],
      {
        baseUrl: 'https://example.test',
        editPath: '/guide/settlements/00000000-0000-4000-8000-000000000099/edit',
        settlementId: '00000000-0000-4000-8000-000000000099',
        runCount: 2,
        measuredAt: '2026-06-10T00:00:00.000Z',
      },
    )

    expect(report.runs).toHaveLength(2)
    expect(report.summary.browserDurationMs.count).toBe(2)
    expect(report.summary.totalMs.min).toBe(3900)
    expect(report.summary.totalMs.max).toBe(4200)
    expect(report.meta.saveTimingDebugEnabled).toBe(true)
    expect(report.meta.actionsPerformed).toContain('draft_save_only')
    expect(report.meta.actionsExcluded).toContain('submit')

    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain('PERF_GUIDE_PASSWORD')
    expect(serialized).not.toContain('password')
    expect(serialized).not.toContain('@qa.example')
  })
})
