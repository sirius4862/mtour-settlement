import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { submitCurrentSettlement } from './submit-flow'
import {
  assertSaveDebugTimingsSanitized,
  attachSaveDebugTimings,
  buildSaveDebugTimings,
  isSaveTimingDebugEnabled,
  sanitizeGetSettlementFullTimingForDebug,
} from './save-timing-debug'
import type { GetSettlementFullTimingLog } from './get-settlement-full-diagnostics'

const ROOT = join(process.cwd())
const SAVE_SETTLEMENT_GENERIC_ERROR = '정산서 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.'

function readRepoFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const sampleFullTiming: GetSettlementFullTimingLog = {
  settlementId: 'settlement-1',
  callPurpose: 'post_save_reload',
  totalMs: 420,
  settlementQueryMs: 80,
  parallelBatchMs: 300,
  queryCount: 8,
  queries: [
    { query: 'settlements', ms: 80, startedOffsetMs: 0 },
    { query: 'meal_items', ms: 120, startedOffsetMs: 0 },
  ],
  sumQueryMs: 500,
  parallelismRatio: 1.67,
  appearsParallel: true,
}

describe('save timing debug (opt-in)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is disabled by default', () => {
    vi.stubEnv('SAVE_TIMING_DEBUG', '')
    expect(isSaveTimingDebugEnabled()).toBe(false)
    const result = attachSaveDebugTimings({ ok: true }, buildSaveDebugTimings({ steps: [] }))
    expect(result._debugTimings).toBeUndefined()
  })

  it('attaches sanitized _debugTimings when SAVE_TIMING_DEBUG=1', () => {
    vi.stubEnv('SAVE_TIMING_DEBUG', '1')
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'b3dbe31d09cb8cd7f22fef00a6f298eb79ea8380')

    const debug = buildSaveDebugTimings({
      steps: [
        { step: 'load_existing_settlement', ms: 200 },
        { step: 'persist_line_items_table', ms: 150, table: 'meal_items', requestCount: 0, updatesSkipped: 5 },
        { step: 'load_post_save_full', ms: 420 },
        { step: 'revalidate_paths', ms: 12 },
      ],
      lineItemRequests: 0,
      preLoad: { ...sampleFullTiming, callPurpose: 'pre_load' },
      postSaveReload: sampleFullTiming,
    })

    assertSaveDebugTimingsSanitized(debug)

    const result = attachSaveDebugTimings({ ok: true, id: 'settlement-1' }, debug)
    expect(result._debugTimings).toBeDefined()
    expect(result._debugTimings?.totalMs).toBe(782)
    expect(result._debugTimings?.deploySha).toBe('b3dbe31d09cb8cd7f22fef00a6f298eb79ea8380')
    expect(result._debugTimings?.preLoad?.callPurpose).toBe('pre_load')
    expect(result._debugTimings?.postSaveReload?.parallelismRatio).toBe(1.67)
    expect(result._debugTimings?.postSaveReload?.appearsParallel).toBe(true)
    expect(result._debugTimings?.steps.some((s) => s.step === 'revalidate_paths')).toBe(true)
    expect(JSON.stringify(result._debugTimings)).not.toContain('settlement-1')
  })

  it('sanitizes getSettlementFull timing without settlement id', () => {
    const sanitized = sanitizeGetSettlementFullTimingForDebug(sampleFullTiming)
    expect(sanitized).not.toHaveProperty('settlementId')
    expect(sanitized.queries).toEqual([
      { query: 'settlements', ms: 80 },
      { query: 'meal_items', ms: 120 },
    ])
  })
})

describe('save timing debug wiring (source-level)', () => {
  it('saveSettlementDraft uses finalizeDraftSaveResult gated by SAVE_TIMING_DEBUG', () => {
    const actions = readRepoFile('src/lib/actions/settlementActions.ts')
    const body = actions.slice(
      actions.indexOf('export async function saveSettlementDraft'),
      actions.indexOf('export async function saveAdminSettlementEdits'),
    )
    expect(body).toContain('isSaveTimingDebugEnabled()')
    expect(body).toContain('finalizeDraftSaveResult(')
    expect(body).toContain("step: 'revalidate_paths'")
    expect(body).toContain('onTimingCaptured')
  })

  it('SettlementForm mirrors debug timings through logSaveDebugTimings', () => {
    const form = readRepoFile('src/components/settlement/SettlementForm.tsx')
    expect(form).toContain('logSaveDebugTimings(')
    expect(form).toContain('debugTimings: saveResult.debugTimings')
  })
})

describe('save-before-submit debug propagation', () => {
  it('propagates debugTimings from pre-save draft through submit flow', async () => {
    const debugTimings = buildSaveDebugTimings({
      steps: [{ step: 'load_post_save_full', ms: 300 }],
    })
    let settlementId: string | null = null

    const result = await submitCurrentSettlement({
      getSettlementId: () => settlementId,
      saveDraft: async () => {
        settlementId = 'new-settlement-id'
        return { ok: true, debugTimings }
      },
      submitWithDraft: async () => ({ ok: true }),
      submitSaved: async () => ({ ok: true }),
    })

    expect(result.ok).toBe(true)
  })

  it('still propagates specific save errors when debugTimings present', async () => {
    const debugTimings = buildSaveDebugTimings({
      steps: [{ step: 'persist_line_items', ms: 100 }],
    })

    const result = await submitCurrentSettlement({
      getSettlementId: () => null,
      saveDraft: async () => ({
        ok: false,
        error: SAVE_SETTLEMENT_GENERIC_ERROR,
        saveStep: 'client_handle_save',
        debugTimings,
      }),
      submitWithDraft: async () => ({ ok: true }),
      submitSaved: async () => ({ ok: true }),
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe(SAVE_SETTLEMENT_GENERIC_ERROR)
  })
})
