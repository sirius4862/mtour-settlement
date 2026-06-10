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
