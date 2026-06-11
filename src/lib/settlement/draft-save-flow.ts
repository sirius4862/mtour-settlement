import type { SettlementSyncPayload } from './mappers'
import type { SaveDebugTimings } from './save-timing-debug'

export type DraftSaveActionResult = {
  ok: boolean
  id?: string
  sync?: SettlementSyncPayload
  error?: string
  /** Present only when server SAVE_TIMING_DEBUG=1. Never shown in UI. */
  _debugTimings?: SaveDebugTimings
}

export type DraftSaveResultHandlers = {
  currentSettlementId: string | null
  bindSettlementId: (id: string) => void
  markSaved: (id: string) => void
  mergeServerSync: (sync: SettlementSyncPayload) => void
  setSaveError: (message: string) => void
}

export type DraftSaveFlowResult = {
  ok: boolean
  settlementId?: string
  becameExistingSettlement: boolean
}

/**
 * A newly inserted settlement id must be retained even if child-row persistence,
 * submit, or a duplicate-recovery path reports an error afterward.
 */
export function applyDraftSaveResult(
  result: DraftSaveActionResult,
  handlers: DraftSaveResultHandlers,
): DraftSaveFlowResult {
  const returnedId = result.id ?? null
  const becameExistingSettlement =
    !!returnedId && returnedId !== handlers.currentSettlementId

  if (returnedId) {
    handlers.bindSettlementId(returnedId)
  }

  if (result.ok && returnedId) {
    handlers.markSaved(returnedId)
    if (result.sync) handlers.mergeServerSync(result.sync)
    return {
      ok: true,
      settlementId: returnedId,
      becameExistingSettlement,
    }
  }

  handlers.setSaveError(result.error ?? '저장 실패')
  return {
    ok: false,
    settlementId: returnedId ?? undefined,
    becameExistingSettlement,
  }
}
