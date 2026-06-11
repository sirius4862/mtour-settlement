import type { GuideLineItemTable } from './guide-line-item-persist'

export type SettlementSaveStep =
  | 'validate_draft_payload'
  | 'load_existing_settlement'
  | 'upsert_settlement_header'
  | 'validate_items_payload'
  | 'assert_editable_settlement'
  | 'persist_line_items'
  | 'persist_calc_summary'
  | 'load_post_save_full'

export type LineItemPersistStep = 'orphan_delete' | 'explicit_delete' | 'insert' | 'update'

export function formatSettlementSaveStepLog(
  step: SettlementSaveStep,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return { saveStep: step, ...extra }
}

export function formatLineItemPersistStepLog(
  table: GuideLineItemTable | string,
  step: LineItemPersistStep,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return { saveStep: 'persist_line_items', table, lineItemStep: step, ...extra }
}

export type SettlementSaveTiming = {
  step: SettlementSaveStep | 'persist_line_items_table' | 'persist_company_expenses'
  ms: number
  table?: string
  requestCount?: number
  deleteIds?: number
  inserts?: number
  updates?: number
  updatesSkipped?: number
}

/** Dev/server timing log — never surfaced to users. */
export function logSettlementSaveTimings(
  context: string,
  timings: SettlementSaveTiming[],
  extra?: Record<string, unknown>,
): void {
  const totalMs = timings.reduce((sum, t) => sum + t.ms, 0)
  const totalRequests = timings.reduce((sum, t) => sum + (t.requestCount ?? 0), 0)
  console.info(context, {
    ...extra,
    totalMs,
    totalRequests,
    steps: timings,
  })
}
