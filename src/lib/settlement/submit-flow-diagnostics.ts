import type { SaveDebugTimings } from './save-timing-debug'

export type SettlementFormAction = 'save_only' | 'save_then_submit'

export type SubmitFlowDiagnostic = {
  action: SettlementFormAction
  submitStep?: string
  saveStep?: string
  validationStep?: string
  table?: string
  settlementId?: string | null
  error?: string
  /** Mirrored from server when SAVE_TIMING_DEBUG=1 — DevTools only. */
  debugTimings?: SaveDebugTimings
}

/** Client-side diagnostic log — never shown to users. */
export function logSubmitFlowAction(diag: SubmitFlowDiagnostic): void {
  console.error('[settlement-form-action]', diag)
}

/** Mirror sanitized server timings to browser console when debug is enabled. */
export function logSaveDebugTimings(
  action: SettlementFormAction,
  debugTimings?: SaveDebugTimings,
  extra?: Omit<SubmitFlowDiagnostic, 'action' | 'debugTimings'>,
): void {
  if (!debugTimings) return
  logSubmitFlowAction({ action, debugTimings, ...extra })
}
