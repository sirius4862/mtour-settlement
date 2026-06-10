import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertAdminReadOnlyAfterApproval,
  assertRoleCanMarkPaid,
  canMarkSettlementPaid,
  canOperationalAdminReview,
  canSaveAdminSettlementEdits,
} from '@/lib/auth/permissions'
import {
  buildSnapshotInsertRow,
  GUIDE_FORBIDDEN_BASE_SELECTS,
  GUIDE_LINE_ITEM_TABLES,
  GUIDE_WORKFLOW_WRITE_PATH,
} from './guide-workflow-writes'
import { persistGuideLineItemTable } from './guide-line-item-persist'
import {
  filterGuideConfirmationChanges,
  sanitizeSettlementFullForGuide,
  stripKbFromGuideSnapshotPayload,
} from './snapshot'
import type { SettlementFull } from '@/types'
import { assertGuideConfirmAction } from './status-guards'

const ROOT = join(process.cwd())

function readRepoFile(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf8')
}

describe('guide workflow RLS regression', () => {
  it('documents save draft write path touching expected tables', () => {
    const saveSteps = GUIDE_WORKFLOW_WRITE_PATH.filter((s) => s.flow === 'save_draft')
    const tables = new Set(saveSteps.map((s) => s.table))
    expect(tables.has('settlements')).toBe(true)
    for (const table of GUIDE_LINE_ITEM_TABLES) {
      expect(tables.has(table)).toBe(true)
    }
    expect(saveSteps.some((s) => s.table === 'settlement_snapshots')).toBe(false)
  })

  it('documents line-item save path for every guide-editable table', () => {
    const editableStatuses = ['draft', 'rejected', 'edit_requested'] as const
    for (const table of GUIDE_LINE_ITEM_TABLES) {
      for (const operation of ['INSERT', 'UPDATE', 'DELETE'] as const) {
        const step = GUIDE_WORKFLOW_WRITE_PATH.find(
          (s) =>
            s.flow === 'save_draft' &&
            s.table === table &&
            s.operation === operation,
        )
        expect(step, `${table} ${operation}`).toBeDefined()
        expect(step?.statuses).toEqual([...editableStatuses])
        expect(step?.rlsPolicyHint).toBe(`${table}_guide_${operation.toLowerCase()}`)
      }
    }
  })

  it('persistSettlementLineItems passes explicit soft-delete ids to persist helper', () => {
    const source = readRepoFile('src/lib/actions/settlementActions.ts')
    expect(source).toContain('explicitDeleteIdsFromDraft')
    expect(source).toContain('persistGuideLineItemTable(supabase, table, settlementId, rows, deleteIds)')
  })

  it('persistSettlementLineItems does not use upsert on line-item tables', () => {
    const source = readRepoFile('src/lib/actions/settlementActions.ts')
    const start = source.indexOf('async function persistSettlementLineItems')
    const end = source.indexOf('/** Admin-only — guide save must never call this.', start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const fnBody = source.slice(start, end)
    expect(fnBody).toContain('persistGuideLineItemTable')
    expect(fnBody).not.toContain('.upsert(')
    expect(fnBody).not.toContain('.select(')
  })

  it('persistGuideLineItemTable uses insert + update without upsert', () => {
    const source = readRepoFile('src/lib/settlement/guide-line-item-persist.ts')
    expect(source).toContain('.insert(toInsert)')
    expect(source).toContain(".update(patch)")
    expect(source).not.toContain('.upsert(')
    expect(source).not.toContain('.select(')
  })

  it('line-item SQL fix covers all guide-editable tables without guide base SELECT', () => {
    const sql = readRepoFile('supabase/settlement_rls_line_items_guide_write_fix.sql')
    for (const table of [...GUIDE_LINE_ITEM_TABLES, 'receipts']) {
      expect(sql).toContain(`'public.${table}'::regclass`)
    }
    expect(sql).toContain("v_short_name || '_guide_insert'")
    expect(sql).toContain('settlement_allows_guide_content_mutation')
    expect(sql).toContain('settlement_guide_owns')
    expect(sql).not.toMatch(/CREATE POLICY \w+_guide_select/i)
  })

  it('guide content mutation allows only draft, rejected, edit_requested', () => {
    const sql = readRepoFile('supabase/settlement_rls_line_items_guide_write_fix.sql')
    expect(sql).toContain("'draft', 'rejected', 'edit_requested'")
    expect(sql).not.toContain("'submitted'")
    expect(sql).not.toContain("'pending_guide_confirmation'")
    expect(sql).not.toContain("'clarification_requested'")
  })

  it('persistGuideLineItemTable performs explicit delete, insert, and per-row update', async () => {
    const calls: string[] = []
    const supabase = {
      from(table: string) {
        return {
          delete() {
            calls.push(`delete:${table}`)
            const deleteChain = {
              eq(col: string) {
                if (col === 'settlement_id') {
                  return deleteChain
                }
                return deleteChain
              },
              not() {
                calls.push(`orphan-delete:${table}`)
                return Promise.resolve({ error: null, count: 0 })
              },
              then(onFulfilled?: (v: { error: null; count: number }) => unknown) {
                return Promise.resolve({ error: null, count: 0 }).then(onFulfilled)
              },
            }
            return deleteChain
          },
          insert(rows: unknown[]) {
            calls.push(`insert:${table}:${(rows as unknown[]).length}`)
            return Promise.resolve({ error: null })
          },
          update(patch: Record<string, unknown>) {
            calls.push(`update:${table}:${Object.keys(patch).join(',')}`)
            return {
              eq() {
                return {
                  eq() {
                    return Promise.resolve({ error: null })
                  },
                }
              },
            }
          },
        }
      },
    }

    const result = await persistGuideLineItemTable(
      supabase as never,
      'meal_items',
      '00000000-0000-4000-8000-000000000001',
      [
        { id: '00000000-0000-4000-8000-000000000002', settlement_id: '00000000-0000-4000-8000-000000000001', meal_date: '2025-01-01' },
        { settlement_id: '00000000-0000-4000-8000-000000000001', meal_date: '2025-01-02' },
      ],
      ['00000000-0000-4000-8000-000000000099'],
    )
    expect(result.ok).toBe(true)
    expect(calls.some((c) => c.startsWith('delete:meal_items'))).toBe(true)
    expect(calls.some((c) => c.startsWith('insert:meal_items:1'))).toBe(true)
    expect(calls.some((c) => c.startsWith('update:meal_items'))).toBe(true)
  })

  it('submitSettlement verifies status after settlements update', () => {
    const source = readRepoFile('src/lib/actions/settlementActions.ts')
    const fnMatch = source.match(/export async function submitSettlement[\s\S]*?\n\}/)
    expect(fnMatch).toBeTruthy()
    const fnBody = fnMatch![0]
    expect(fnBody).toContain("verified?.status !== 'submitted'")
    expect(fnBody).toContain("logStep('verify_failed'")
    expect(fnBody).toContain("logStep('before_update'")
    expect(fnBody).toContain("logStep('after_update'")
    expect(fnBody).toContain("guide_submit_settlement")
    expect(fnBody).not.toContain('rpc_missing_fallback_direct_update')
    expect(fnBody).not.toContain(".from('settlements')")
  })

  it('guide submit transition fix SQL adds RPC only (status logs fixed separately)', () => {
    const sql = readRepoFile('supabase/settlement_rls_guide_submit_transition_fix.sql')
    expect(sql).toContain('guide_submit_settlement')
    expect(sql).toContain('GET DIAGNOSTICS v_rows = ROW_COUNT')
    expect(sql).not.toContain('trg_log_settlement_status_change')
  })

  it('admin status logs fix SQL covers trigger and admin tier policies', () => {
    const sql = readRepoFile('supabase/settlement_rls_admin_status_logs_fix.sql')
    expect(sql).toContain('trg_log_settlement_status_change')
    expect(sql).toContain('settlement_status_logs_admin_all')
    expect(sql).toContain('settlement_status_logs_admin_insert')
    expect(sql).toContain('settlement_status_logs_guide_insert')
    expect(sql).toContain('auth_user_is_admin_tier()')
  })

  it('C3 master paid lock SQL hardens trigger and splits master RLS policies', () => {
    const sql = readRepoFile('supabase/settlement_workflow_v1_c3_master_paid_lock.sql')
    expect(sql).toContain('Master cannot modify paid settlement')
    expect(sql).toContain('Master cannot transition paid settlement')
    expect(sql).toContain('Master settlement status transition not allowed')
    expect(sql).toContain('settlements_master_reopen_paid')
    expect(sql).toContain("status = 'edit_requested'::public.settlement_status")
    expect(sql).toContain('guide_confirmed_at IS NULL')
  })

  it('C3a hotfix blocks paid in-place edits before workflow no-op shortcut', () => {
    const sql = readRepoFile('supabase/settlement_workflow_v1_c3a_paid_inplace_lock.sql')
    expect(sql).toContain('Cannot modify paid settlement')
    expect(sql).not.toMatch(/CREATE POLICY settlements_paid_inplace_deny/)
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*OLD\.status/)
    expect(sql).toMatch(
      /IF OLD\.status = 'paid'::public\.settlement_status[\s\S]*RAISE EXCEPTION 'Cannot modify paid settlement'[\s\S]*IF OLD\.status IS NOT DISTINCT FROM NEW\.status/,
    )
  })

  it('sendForConfirmation uses atomic admin_send_for_confirmation RPC', () => {
    const source = readRepoFile('src/lib/actions/settlementActions.ts')
    const fnMatch = source.match(/async function queuePendingGuideConfirmation[\s\S]*?\n\}/)
    expect(fnMatch).toBeTruthy()
    expect(fnMatch![0]).toContain('admin_send_for_confirmation')
    expect(fnMatch![0]).toContain('[sendForConfirmation] before_admin_send_rpc')
    expect(fnMatch![0]).not.toContain("from('settlement_confirmations').insert")
  })

  it('admin_send_for_confirmation RPC SQL exists', () => {
    const sql = readRepoFile('supabase/settlement_workflow_v1_admin_send_confirmation_rpc.sql')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_send_for_confirmation')
    expect(sql).toContain('settlement_field_changes')
    expect(sql).toContain('IF v_rows <> 1 THEN')
  })

  it('guide submit SQL fix strengthens settlements update and audit policies', () => {
    const sql = readRepoFile('supabase/settlement_rls_guide_submit_fix.sql')
    expect(sql).toContain('settlements_guide_update')
    expect(sql).toContain('settlement_allows_guide_workflow_mutation')
    expect(sql).toContain('settlement_status_logs_guide_insert')
    expect(sql).toContain('settlement_audit_events_guide_insert')
    expect(sql).toContain('settlement_snapshots_guide_insert')
    expect(sql).toContain("'submitted'")
  })

  it('guide detail page routes submit to edit form (no submitSettlement-only button)', () => {
    const detail = readRepoFile('src/app/guide/settlements/[id]/page.tsx')
    expect(detail).not.toContain('SubmitButton')
    expect(detail).not.toContain('submitSettlement')
    expect(detail).toContain('저장 후 제출')
    expect(detail).toContain('/edit')
  })

  it('SettlementForm submits via submitCurrentSettlement without losing the current draft', () => {
    const form = readRepoFile('src/components/settlement/SettlementForm.tsx')
    // Existing settlement: submit with the latest draft payload in one call.
    expect(form).toContain('toDraftPayload(useSettlementFormStore.getState())')
    expect(form).toContain('submitWithDraft')
    // Never-saved settlement: save the draft first, then submit the new id (H3).
    expect(form).toContain('submitCurrentSettlement')
    expect(form).toContain('saveDraft')
  })

  it('submitSettlement persists draft before snapshot when payload provided', () => {
    const source = readRepoFile('src/lib/actions/settlementActions.ts')
    const fnMatch = source.match(/export async function submitSettlement[\s\S]*?\n\}/)
    expect(fnMatch).toBeTruthy()
    expect(fnMatch![0]).toContain('saveSettlementDraft')
    expect(fnMatch![0]).toContain('save_before_submit_ok')
  })

  it('documents submit path including snapshot INSERT without base SELECT', () => {
    const submitSteps = GUIDE_WORKFLOW_WRITE_PATH.filter((s) => s.flow === 'submit')
    const snapInsert = submitSteps.find(
      (s) => s.table === 'settlement_snapshots' && s.operation === 'INSERT',
    )
    expect(snapInsert).toBeDefined()
    expect(snapInsert?.notes).toMatch(/no INSERT RETURNING/i)
    expect(
      submitSteps.some(
        (s) => s.table === 'settlement_snapshots' && s.operation === 'SELECT',
      ),
    ).toBe(false)
  })

  it('insertSnapshot does not use INSERT…RETURNING on settlement_snapshots', () => {
    const source = readRepoFile('src/lib/actions/settlementActions.ts')
    const fnMatch = source.match(
      /async function insertSnapshot[\s\S]*?\n\}/,
    )
    expect(fnMatch).toBeTruthy()
    const fnBody = fnMatch![0]
    expect(fnBody).toContain('buildSnapshotInsertRow')
    expect(fnBody).toContain(".from('settlement_snapshots').insert(row)")
    expect(fnBody).not.toContain('.select(')
  })

  it('buildSnapshotInsertRow returns client id and full row', () => {
    const payload = {
      exchange_rate: 25000,
      header: {},
      hotels: [],
      meals: [],
      entrances: [],
      others: [],
      company_expenses: [],
      shoppings: [],
      options: [],
      calc_summary: {
        company_deposit_usd: 1,
        guide_settlement_usd: 2,
        guide_payout_usd: 2,
        company_grand_total_usd: 99,
      },
    }
    const { id, row } = buildSnapshotInsertRow({
      settlementId: '00000000-0000-4000-8000-000000000001',
      kind: 'guide_submit',
      payload,
      createdBy: '00000000-0000-4000-8000-000000000002',
    })
    expect(row.id).toBe(id)
    expect(row.created_by).toBe('00000000-0000-4000-8000-000000000002')
    expect(row.kind).toBe('guide_submit')
  })

  it('guide workflow fix SQL strengthens snapshot INSERT without base SELECT policy', () => {
    const sql = readRepoFile('supabase/settlement_rls_guide_workflow_fix.sql')
    expect(sql).toContain('settlement_snapshots_guide_insert')
    expect(sql).toContain('settlement_guide_owns(settlement_id)')
    expect(sql).not.toMatch(
      /CREATE POLICY settlement_snapshots_guide_select/i,
    )
  })

  it('forbids direct guide base SELECT on redacted tables', () => {
    expect(GUIDE_FORBIDDEN_BASE_SELECTS).toContain('settlements')
    expect(GUIDE_FORBIDDEN_BASE_SELECTS).toContain('settlement_snapshots')
    expect(GUIDE_FORBIDDEN_BASE_SELECTS).toContain('company_expense_items')
  })

  it('guide cannot read company profit fields in sanitized settlement', () => {
    const full = {
      id: 's1',
      ground_fee_usd: 500,
      vehicle_fee_usd: 100,
      tc_company_usd: 50,
      calc_summary_json: { company_grand_total_usd: 9999, guide_payout_usd: 100 },
      company_expenses: [{ id: 'ce1', amount_usd: 200 }],
      hotels: [],
      shoppings: [],
      meals: [],
      entrances: [],
      others: [],
      options: [],
      receipts: [],
    } as unknown as SettlementFull
    const sanitized = sanitizeSettlementFullForGuide(full)
    expect(sanitized.ground_fee_usd).toBe(0)
    expect(sanitized.vehicle_fee_usd).toBe(0)
    expect(sanitized.company_expenses).toEqual([])
    expect(
      (sanitized.calc_summary_json as Record<string, unknown>).company_grand_total_usd,
    ).toBeUndefined()
  })

  it('guide snapshot payload strips KB and company expenses', () => {
    const payload = {
      exchange_rate: 1,
      header: {},
      hotels: [],
      meals: [],
      entrances: [],
      others: [],
      company_expenses: [{ amount_usd: 1 }],
      shoppings: [{ kb_usd: 50, sale_usd: 100 }],
      options: [],
      calc_summary: {
        company_deposit_usd: 0,
        guide_settlement_usd: 0,
        guide_payout_usd: 0,
        company_grand_total_usd: 999,
      },
    }
    const stripped = stripKbFromGuideSnapshotPayload(payload)
    expect(stripped.shoppings[0]).not.toHaveProperty('kb_usd')
  })

  it('guide cannot self-approve via status guard', () => {
    const result = assertGuideConfirmAction(
      { status: 'submitted', guide_id: 'g1' },
      'g1',
      'confirm',
    )
    expect(result.ok).toBe(false)
  })

  it('guide cannot mark paid', () => {
    expect(canMarkSettlementPaid('guide')).toBe(false)
    expect(assertRoleCanMarkPaid('guide').ok).toBe(false)
  })

  it('admin can review submitted settlement', () => {
    expect(canOperationalAdminReview('admin')).toBe(true)
    expect(canSaveAdminSettlementEdits('submitted', 'admin')).toBe(true)
    expect(assertAdminReadOnlyAfterApproval('admin', 'submitted').ok).toBe(true)
  })

  it('admin can mark paid (admin tier)', () => {
    expect(canMarkSettlementPaid('admin')).toBe(true)
    expect(assertRoleCanMarkPaid('admin').ok).toBe(true)
  })

  it('master_admin can mark paid', () => {
    expect(canMarkSettlementPaid('master_admin')).toBe(true)
    expect(assertRoleCanMarkPaid('master_admin').ok).toBe(true)
  })

  it('guide confirm path hides company profit in field changes', () => {
    const changes = filterGuideConfirmationChanges([
      {
        field_path: 'calc_summary.company_grand_total_usd',
        excel_ref: 'R87',
        label: '회사수익',
      },
      {
        field_path: 'header.advance_vnd',
        excel_ref: 'A76',
        label: '전도금',
      },
    ])
    expect(changes).toHaveLength(1)
    expect(changes[0].field_path).toBe('header.advance_vnd')
  })

  it('confirm and clarification flows touch expected policies', () => {
    const confirm = GUIDE_WORKFLOW_WRITE_PATH.filter((s) => s.flow === 'confirm')
    expect(confirm.some((s) => s.table === 'settlement_snapshots' && s.operation === 'INSERT')).toBe(
      true,
    )
    expect(
      confirm.some((s) => s.table === 'settlement_confirmations' && s.operation === 'UPDATE'),
    ).toBe(true)

    const clarification = GUIDE_WORKFLOW_WRITE_PATH.filter((s) => s.flow === 'clarification')
    expect(clarification.some((s) => s.table === 'settlements' && s.operation === 'UPDATE')).toBe(
      true,
    )
  })
})
