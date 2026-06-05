export interface SubmitResult {
  ok: boolean
  error?: string
}

export interface SubmitFlowDeps {
  /** Current settlement id from the form store (null = never saved). */
  getSettlementId: () => string | null
  /** Save the current draft; resolves true on success (store id is set). */
  saveDraft: () => Promise<boolean>
  /** Existing settlement: save current edits + submit in one server call. */
  submitWithDraft: (id: string) => Promise<SubmitResult>
  /** Already-persisted settlement: submit only (no re-save). */
  submitSaved: (id: string) => Promise<SubmitResult>
}

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
    return deps.submitWithDraft(existingId)
  }

  const saved = await deps.saveDraft()
  if (!saved) {
    return { ok: false, error: '제출 전 임시저장에 실패했습니다. 입력 내용을 확인해주세요.' }
  }

  const newId = deps.getSettlementId()
  if (!newId) {
    return { ok: false, error: '정산서 저장 후 ID를 확인할 수 없습니다. 다시 시도해주세요.' }
  }

  return deps.submitSaved(newId)
}
