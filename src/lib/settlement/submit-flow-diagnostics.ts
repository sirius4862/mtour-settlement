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

/** Single-line JSON for DevTools and Playwright automation capture. */
export function formatSubmitFlowActionLog(diag: SubmitFlowDiagnostic): string {
  return `[settlement-form-action] ${JSON.stringify(diag)}`
}

/** Client-side diagnostic log — never shown to users. */
export function logSubmitFlowAction(diag: SubmitFlowDiagnostic): void {
  console.error(formatSubmitFlowActionLog(diag))
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
