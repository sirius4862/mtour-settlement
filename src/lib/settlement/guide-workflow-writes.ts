import { randomUUID } from 'crypto'
import type { SettlementStatus } from '@/types'
import type { SnapshotPayload } from './snapshot'
import { GUIDE_LINE_ITEM_TABLES } from './guide-line-item-persist'

export { GUIDE_LINE_ITEM_TABLES }

/** DB tables touched by guide save/submit/confirm flows (base tables, not views). */
export const GUIDE_WORKFLOW_TABLES = [
  'profiles',
  'tours',
  'settlements',
  'hotel_items',
  'meal_items',
  'entrance_items',
  'other_expense_items',
  'shopping_items',
  'option_items',
  'receipts',
  'settlement_snapshots',
  'settlement_confirmations',
  'settlement_field_changes',
  'settlement_audit_events',
] as const

export type GuideWorkflowTable = (typeof GUIDE_WORKFLOW_TABLES)[number]
export type DbOperation = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'

export interface GuideWorkflowWriteStep {
  flow: 'save_draft' | 'submit' | 'confirm' | 'clarification'
  table: GuideWorkflowTable | 'settlements_guide_read' | 'receipts_guide_read'
  operation: DbOperation
  /** Settlement statuses when this step runs (empty = any / N/A). */
  statuses: SettlementStatus[]
  rlsPolicyHint: string
  notes?: string
}

/**
 * Authoritative map of guide write/read steps for RLS regression tests.
 * Guides must use *_guide_read views for sensitive SELECTs; base-table INSERT
 * must not use `.select()` RETURNING on redacted tables (settlement_snapshots).
 */
export const GUIDE_WORKFLOW_WRITE_PATH: GuideWorkflowWriteStep[] = [
  { flow: 'save_draft', table: 'profiles', operation: 'SELECT', statuses: [], rlsPolicyHint: 'profiles_select' },
  { flow: 'save_draft', table: 'tours', operation: 'SELECT', statuses: [], rlsPolicyHint: 'tours_select' },
  {
    flow: 'save_draft',
    table: 'settlements_guide_read',
    operation: 'SELECT',
    statuses: ['draft', 'rejected', 'edit_requested'],
    rlsPolicyHint: 'view: settlements_guide_read',
    notes: 'Pre-save load; redacted',
  },
  {
    flow: 'save_draft',
    table: 'settlements',
    operation: 'INSERT',
    statuses: ['draft'],
    rlsPolicyHint: 'settlements_guide_insert',
  },
  {
    flow: 'save_draft',
    table: 'settlements',
    operation: 'UPDATE',
    statuses: ['draft', 'rejected', 'edit_requested'],
    rlsPolicyHint: 'settlements_guide_update',
  },
  ...GUIDE_LINE_ITEM_TABLES.flatMap((table) => [
    {
      flow: 'save_draft' as const,
      table,
      operation: 'INSERT' as const,
      statuses: ['draft', 'rejected', 'edit_requested'] as SettlementStatus[],
      rlsPolicyHint: `${table}_guide_insert`,
      notes: 'No upsert/RETURNING — persistGuideLineItemTable',
    },
    {
      flow: 'save_draft' as const,
      table,
      operation: 'UPDATE' as const,
      statuses: ['draft', 'rejected', 'edit_requested'] as SettlementStatus[],
      rlsPolicyHint: `${table}_guide_update`,
      notes: 'Per-row update, no upsert/RETURNING',
    },
    {
      flow: 'save_draft' as const,
      table,
      operation: 'DELETE' as const,
      statuses: ['draft', 'rejected', 'edit_requested'] as SettlementStatus[],
      rlsPolicyHint: `${table}_guide_delete`,
    },
  ]),
  {
    flow: 'save_draft',
    table: 'settlements',
    operation: 'UPDATE',
    statuses: ['draft', 'rejected', 'edit_requested'],
    rlsPolicyHint: 'settlements_guide_update',
    notes: 'calc_summary_json persist',
  },
  {
    flow: 'submit',
    table: 'settlements_guide_read',
    operation: 'SELECT',
    statuses: ['draft', 'rejected', 'edit_requested'],
    rlsPolicyHint: 'view: settlements_guide_read',
  },
  {
    flow: 'submit',
    table: 'settlement_snapshots',
    operation: 'INSERT',
    statuses: ['draft', 'rejected', 'edit_requested'],
    rlsPolicyHint: 'settlement_snapshots_guide_insert',
    notes: 'kind=guide_submit; client-generated id, no INSERT RETURNING',
  },
  {
    flow: 'submit',
    table: 'settlements',
    operation: 'UPDATE',
    statuses: ['draft', 'rejected', 'edit_requested'],
    rlsPolicyHint: 'settlements_guide_update',
    notes: 'status → submitted',
  },
  {
    flow: 'submit',
    table: 'settlement_audit_events',
    operation: 'INSERT',
    statuses: ['draft', 'rejected', 'edit_requested'],
    rlsPolicyHint: 'settlement_audit_events_guide_insert',
  },
  {
    flow: 'confirm',
    table: 'settlements_guide_read',
    operation: 'SELECT',
    statuses: ['pending_guide_confirmation'],
    rlsPolicyHint: 'view: settlements_guide_read',
  },
  {
    flow: 'confirm',
    table: 'settlement_snapshots',
    operation: 'INSERT',
    statuses: ['pending_guide_confirmation'],
    rlsPolicyHint: 'settlement_snapshots_guide_insert',
    notes: 'kind=guide_confirmed; client-generated id',
  },
  {
    flow: 'confirm',
    table: 'settlement_confirmations',
    operation: 'UPDATE',
    statuses: ['pending_guide_confirmation'],
    rlsPolicyHint: 'settlement_confirmations_guide_update',
  },
  {
    flow: 'confirm',
    table: 'settlements',
    operation: 'UPDATE',
    statuses: ['pending_guide_confirmation'],
    rlsPolicyHint: 'settlements_guide_update',
    notes: 'status → approved',
  },
  {
    flow: 'clarification',
    table: 'settlements_guide_read',
    operation: 'SELECT',
    statuses: ['pending_guide_confirmation'],
    rlsPolicyHint: 'view: settlements_guide_read',
  },
  {
    flow: 'clarification',
    table: 'settlements',
    operation: 'UPDATE',
    statuses: ['pending_guide_confirmation'],
    rlsPolicyHint: 'settlements_guide_update',
    notes: 'status → clarification_requested',
  },
  {
    flow: 'clarification',
    table: 'settlement_audit_events',
    operation: 'INSERT',
    statuses: ['pending_guide_confirmation'],
    rlsPolicyHint: 'settlement_audit_events_guide_insert',
  },
]

export type SnapshotKind = 'guide_submit' | 'admin_pre_confirm' | 'guide_confirmed'

/** Build snapshot row with client id — avoids INSERT…RETURNING under RLS. */
export function buildSnapshotInsertRow(params: {
  settlementId: string
  kind: SnapshotKind
  payload: SnapshotPayload
  createdBy: string
}): { id: string; row: Record<string, unknown> } {
  const id = randomUUID()
  return {
    id,
    row: {
      id,
      settlement_id: params.settlementId,
      kind: params.kind,
      payload_json: params.payload,
      calc_summary_json: params.payload.calc_summary,
      created_by: params.createdBy,
    },
  }
}

/** Tables guides must not SELECT from directly (use *_guide_read views). */
export const GUIDE_FORBIDDEN_BASE_SELECTS = [
  'settlements',
  'settlement_snapshots',
  'settlement_confirmations',
  'settlement_field_changes',
  'company_expense_items',
] as const
