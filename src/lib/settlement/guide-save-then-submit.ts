export type GuideSaveThenSubmitPhase = 'save' | 'submit'

export type GuideSaveThenSubmitResult =
  | { ok: true }
  | { ok: false; phase: GuideSaveThenSubmitPhase; error: string }

/**
 * Guide correction submit: persist draft first, then transition to submitted.
 * Caller owns validation, confirm UX, and pending/disabled state.
 */
export async function runGuideSaveThenSubmit(params: {
  save: () => Promise<boolean>
  submit: (settlementId: string) => Promise<{ ok: boolean; error?: string }>
  getSettlementId: () => string | null
}): Promise<GuideSaveThenSubmitResult> {
  const saved = await params.save()
  if (!saved) {
    return { ok: false, phase: 'save', error: 'save_failed' }
  }

  const id = params.getSettlementId()
  if (!id) {
    return { ok: false, phase: 'save', error: 'missing_settlement_id' }
  }

  const result = await params.submit(id)
  if (!result.ok) {
    return {
      ok: false,
      phase: 'submit',
      error: result.error?.trim() || 'submit_failed',
    }
  }

  return { ok: true }
}
