import { logSubmitFlowAction } from './submit-flow-diagnostics'

export interface SubmitResult {
  ok: boolean
  error?: string
}

export type SaveDraftOutcome =
  | { ok: true }
  | { ok: false; error?: string; validationStep?: string; saveStep?: string; table?: string }

export interface SubmitFlowDeps {
  /** Current settlement id from the form store (null = never saved). */
  getSettlementId: () => string | null
  /** Save the current draft; resolves with outcome (store id is set on success). */
  saveDraft: () => Promise<SaveDraftOutcome>
  /** Existing settlement: save current edits + submit in one server call. */
  submitWithDraft: (id: string) => Promise<SubmitResult>
  /** Already-persisted settlement: submit only (no re-save). */
  submitSaved: (id: string) => Promise<SubmitResult>
}

const SAVE_BEFORE_SUBMIT_FALLBACK =
  '제출 전 임시저장에 실패했습니다. 입력 내용을 확인해주세요.'

/**
 * Orchestrates "저장 후 제출" for the guide settlement form.
 *
 * - Existing settlement (id present): save current edits + submit (one call).
 * - Never-saved new settlement (id null): persist the draft first to obtain a
 *   real id, then submit that exact settlement — without saving twice.
 *
 * Fixes H3: a brand-new settlement could fail submit because the client bailed
 * out when settlementId was null.
 */
export async function submitCurrentSettlement(deps: SubmitFlowDeps): Promise<SubmitResult> {
  const existingId = deps.getSettlementId()
  if (existingId) {
    const result = await deps.submitWithDraft(existingId)
    if (!result.ok) {
      logSubmitFlowAction({
        action: 'save_then_submit',
        submitStep: 'submit_with_draft',
        settlementId: existingId,
        error: result.error,
      })
    }
    return result
  }

  const saved = await deps.saveDraft()
  if (!saved.ok) {
    const error = saved.error ?? SAVE_BEFORE_SUBMIT_FALLBACK
    logSubmitFlowAction({
      action: 'save_then_submit',
      submitStep: 'pre_save_draft',
      saveStep: saved.saveStep,
      validationStep: saved.validationStep,
      table: saved.table,
      settlementId: deps.getSettlementId(),
      error,
    })
    return { ok: false, error }
  }

  const newId = deps.getSettlementId()
  if (!newId) {
    const error = '정산서 저장 후 ID를 확인할 수 없습니다. 다시 시도해주세요.'
    logSubmitFlowAction({
      action: 'save_then_submit',
      submitStep: 'post_save_missing_id',
      saveStep: 'bind_settlement_id',
      error,
    })
    return { ok: false, error }
  }

  const result = await deps.submitSaved(newId)
  if (!result.ok) {
    logSubmitFlowAction({
      action: 'save_then_submit',
      submitStep: 'submit_saved',
      settlementId: newId,
      error: result.error,
    })
  }
  return result
}
