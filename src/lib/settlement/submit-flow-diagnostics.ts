export type SettlementFormAction = 'save_only' | 'save_then_submit'

export type SubmitFlowDiagnostic = {
  action: SettlementFormAction
  submitStep?: string
  saveStep?: string
  validationStep?: string
  table?: string
  settlementId?: string | null
  error?: string
}

/** Client-side diagnostic log — never shown to users. */
export function logSubmitFlowAction(diag: SubmitFlowDiagnostic): void {
  console.error('[settlement-form-action]', diag)
}
