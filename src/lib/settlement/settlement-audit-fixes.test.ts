import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SETTLEMENT_DUPLICATE_TOUR_ERROR,
  SETTLEMENT_STATUS_STALE_ERROR,
  assertSingleOptimisticUpdate,
  isPgUniqueViolation,
} from './status-guards'

const ACTIONS_PATH = join(process.cwd(), 'src/lib/actions/settlementActions.ts')

function actionBody(fnName: string): string {
  const source = readFileSync(ACTIONS_PATH, 'utf8')
  const start = source.indexOf(`export async function ${fnName}`)
  const end = source.indexOf('export async function', start + 1)
  return source.slice(start, end === -1 ? undefined : end)
}

describe('settlement audit fixes — pure helpers', () => {
  it('detects Postgres unique violation code 23505', () => {
    expect(isPgUniqueViolation({ code: '23505' })).toBe(true)
    expect(isPgUniqueViolation({ code: '23503' })).toBe(false)
    expect(isPgUniqueViolation(null)).toBe(false)
  })

  it('assertSingleOptimisticUpdate requires exactly one row', () => {
    expect(assertSingleOptimisticUpdate([{ id: 's1' }])).toEqual({ ok: true })
    expect(assertSingleOptimisticUpdate([])).toEqual({
      ok: false,
      error: SETTLEMENT_STATUS_STALE_ERROR,
    })
    expect(assertSingleOptimisticUpdate(null)).toEqual({
      ok: false,
      error: SETTLEMENT_STATUS_STALE_ERROR,
    })
    expect(assertSingleOptimisticUpdate([{ id: 'a' }, { id: 'b' }])).toEqual({
      ok: false,
      error: SETTLEMENT_STATUS_STALE_ERROR,
    })
  })
})

describe('upsertSettlement — duplicate tour guard (source-level)', () => {
  const body = actionBody('upsertSettlement')

  it('pre-checks existing settlement by tour_id before insert', () => {
    expect(body).toContain("from('settlements')")
    expect(body).toContain(".eq('tour_id', payload.tour_id)")
    expect(body).toContain(".eq('guide_id', profile.id)")
    expect(body).toContain('if (existingForTour)')
    expect(body).toContain('SETTLEMENT_DUPLICATE_TOUR_ERROR')
  })

  it('returns the accessible existing settlement id for duplicate-create recovery', () => {
    expect(body).toContain('id: existingForTour.id')
    expect(body).toContain('id: existingForTour?.id')
  })

  it('handles DB unique violation 23505 gracefully on insert', () => {
    expect(body).toContain('isPgUniqueViolation(writeResult.error)')
    expect(body).not.toContain("code === '23505'")
  })
})

describe('reviewSettlement — optimistic row-count verification (source-level)', () => {
  const body = actionBody('reviewSettlement')

  it('verifies exactly one row for pay and request_edit updates', () => {
    expect(body).toContain('.select(\'id\')')
    expect(body).toContain('assertSingleOptimisticUpdate(updatedRows)')
  })

  it('verifies exactly one row for paid reopen', () => {
    expect(body).toMatch(/params\.action === 'reopen'[\s\S]*?assertSingleOptimisticUpdate\(updatedRows\)/)
  })
})

describe('recallSettlement — optimistic row-count verification (source-level)', () => {
  const body = actionBody('recallSettlement')

  it('verifies exactly one row changed on status-only recall', () => {
    expect(body).toContain(".eq('status', fromStatus)")
    expect(body).toContain('.select(\'id\')')
    expect(body).toContain('assertSingleOptimisticUpdate(updatedRows)')
  })
})

describe('guideConfirm — RPC + separate confirmation update (source-level)', () => {
  const body = actionBody('guideConfirm')

  it('calls guide_confirm_settlement RPC before settlement_confirmations update', () => {
    const rpcIdx = body.indexOf("rpc('guide_confirm_settlement'")
    const confIdx = body.indexOf("from('settlement_confirmations')")
    expect(rpcIdx).toBeGreaterThan(-1)
    expect(confIdx).toBeGreaterThan(rpcIdx)
  })

  it('documents atomic RPC improvement as future DB migration work', () => {
    expect(body).toContain('TODO(audit)')
    expect(body).toContain('isStuckGuideConfirmation')
  })

  it('does not rewrite guide_confirm_settlement RPC in app code', () => {
    expect(body).not.toMatch(/CREATE OR REPLACE FUNCTION.*guide_confirm_settlement/i)
  })
})

describe('audit triage — duplicate tour UX message', () => {
  it('exposes a friendly duplicate-tour error constant', () => {
    expect(SETTLEMENT_DUPLICATE_TOUR_ERROR).toContain('이미 정산서')
  })
})

describe('saveSettlementDraft — stale line-item id hardening (source-level)', () => {
  const body = actionBody('saveSettlementDraft')

  it('strips all line-item ids on first create', () => {
    expect(body).toContain('stripAllLineItemIdsForCreate')
    expect(body).toMatch(/else\s*\{[\s\S]*stripAllLineItemIdsForCreate/)
  })

  it('strips orphan line-item ids before retrying an existing settlement', () => {
    expect(body).toContain('stripOrphanLineItemIdsFromPayload')
    expect(body).toContain('collectKnownLineItemIds(existingForItemPersist)')
  })

  it('returns the header id when child-item save fails', () => {
    expect(body).toContain('return { ok: false, id: headerResult.id, error: SAVE_SETTLEMENT_GENERIC_ERROR }')
  })

  it('logs child-item failures with step diagnostics', () => {
    expect(body).toContain("formatSettlementSaveStepLog('persist_line_items'")
    const actions = readFileSync(ACTIONS_PATH, 'utf8')
    expect(actions).toContain('formatLineItemPersistStepLog')
  })
})
