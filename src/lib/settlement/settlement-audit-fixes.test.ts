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

describe('guideConfirm — bridge RPC rollout (source-level)', () => {
  const body = actionBody('guideConfirm')

  it('calls guide_confirm_settlement RPC and classifies response via bridge helper', () => {
    expect(body).toContain("rpc('guide_confirm_settlement'")
    expect(body).toContain('resolveGuideConfirmRpcBridge')
  })

  it('legacy RPC path updates settlement_confirmations pending → confirmed', () => {
    expect(body).toContain("bridge.mode === 'legacy'")
    expect(body).toMatch(
      /bridge\.mode === 'legacy'[\s\S]*\.update\([\s\S]*status: 'confirmed'/,
    )
    expect(body).toContain(".eq('status', 'pending')")
    expect(body).toContain('assertSingleOptimisticUpdate(confRows)')
  })

  it('atomic RPC path skips duplicate app-side packet update', () => {
    const legacyBlock = body.match(
      /if \(bridge\.mode === 'legacy'\) \{([\s\S]*?)\n  \}/,
    )?.[1]
    expect(legacyBlock).toBeTruthy()
    expect(legacyBlock).toContain('.update(')
  })

  it('verifies guide_confirmed_at and guide_confirmed_by after RPC', () => {
    expect(body).toContain('guide_confirmed_at, guide_confirmed_by')
    expect(body).toContain('확인 시각이 저장되지 않았습니다')
    expect(body).toContain('snapshot_after_id')
  })

  it('read-back fails clearly when confirmation packet is not confirmed', () => {
    expect(body).toContain('confirmedPacket.status !== \'confirmed\'')
    expect(body).toContain('확인 패킷이 확정되지 않았습니다')
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
    expect(body).toContain('finalizeDraftSaveResult(')
    expect(body).toContain('error: SAVE_SETTLEMENT_GENERIC_ERROR')
  })

  it('logs child-item failures with step diagnostics', () => {
    expect(body).toContain("formatSettlementSaveStepLog('persist_line_items'")
    const actions = readFileSync(ACTIONS_PATH, 'utf8')
    expect(actions).toContain('formatLineItemPersistStepLog')
  })
})
