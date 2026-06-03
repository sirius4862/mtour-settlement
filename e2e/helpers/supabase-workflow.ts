import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

export const TEST_MARKER = 'WORKFLOW_V1_TEST'

export type WorkflowFixture = {
  runId: string
  tourId: string
  settlementId: string
  tourCode: string
}

export async function signInSupabase(
  url: string,
  anonKey: string,
  email: string,
  password: string,
) {
  const client = createClient(url, anonKey)
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) throw new Error(`signIn ${email}: ${error?.message ?? 'no user'}`)
  return { client, userId: data.user.id }
}

export async function guideSubmit(
  guideClient: SupabaseClient,
  settlementId: string,
  guideUserId: string,
) {
  const snapId = randomUUID()
  const now = new Date().toISOString()
  const { error: snapErr } = await guideClient.from('settlement_snapshots').insert({
    id: snapId,
    settlement_id: settlementId,
    kind: 'guide_submit',
    payload_json: { [TEST_MARKER]: true },
    created_by: guideUserId,
  })
  if (snapErr) throw new Error(snapErr.message)

  const { error: rpcErr } = await guideClient.rpc('guide_submit_settlement', {
    p_settlement_id: settlementId,
    p_snapshot_id: snapId,
    p_submitted_at: now,
    p_calc_summary: { company_grand_total_usd: 0 },
  })
  if (rpcErr) throw new Error(rpcErr.message)
}

export async function sendForConfirmation(
  adminClient: SupabaseClient,
  settlementId: string,
  adminUserId: string,
) {
  const { data: settlement, error: readErr } = await adminClient
    .from('settlements')
    .select('id, status, guide_submit_snapshot_id')
    .eq('id', settlementId)
    .single()
  if (readErr || !settlement) throw new Error(readErr?.message ?? 'settlement not found')
  if (settlement.status !== 'submitted') {
    throw new Error(`expected submitted, got ${settlement.status}`)
  }

  const afterSnapId = randomUUID()
  const { error: afterSnapErr } = await adminClient.from('settlement_snapshots').insert({
    id: afterSnapId,
    settlement_id: settlementId,
    kind: 'admin_pre_confirm',
    payload_json: { [TEST_MARKER]: true },
    created_by: adminUserId,
  })
  if (afterSnapErr) throw new Error(afterSnapErr.message)

  const confirmationId = randomUUID()
  const now = new Date().toISOString()
  const { error: confErr } = await adminClient.from('settlement_confirmations').insert({
    id: confirmationId,
    settlement_id: settlementId,
    snapshot_before_id: settlement.guide_submit_snapshot_id,
    snapshot_after_id: afterSnapId,
    status: 'pending',
    sent_by: adminUserId,
    sent_at: now,
    r85_before: 0,
    r85_after: 0,
    r87_before: 0,
    r87_after: 0,
    change_count: 0,
  })
  if (confErr) throw new Error(confErr.message)

  const { data: updated, error: updErr } = await adminClient
    .from('settlements')
    .update({
      status: 'pending_guide_confirmation',
      sent_for_confirmation_at: now,
      sent_for_confirmation_by: adminUserId,
      active_confirmation_id: confirmationId,
      reviewed_at: now,
      reviewed_by: adminUserId,
    })
    .eq('id', settlementId)
    .eq('status', 'submitted')
    .select('id')
  if (updErr) throw new Error(updErr.message)
  if (!updated?.length) throw new Error('send-for-confirmation updated 0 rows')
}

export async function createWorkflowFixture(
  adminClient: SupabaseClient,
  guideClient: SupabaseClient,
  guideId: string,
  branchId: string,
  adminId: string,
  runId: string,
): Promise<WorkflowFixture> {
  const tourId = randomUUID()
  const settlementId = randomUUID()
  const tourCode = `${TEST_MARKER}-e2e-${runId}`
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() + 7)
  const end = new Date(start)
  end.setDate(end.getDate() + 3)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const { error: tourErr } = await adminClient.from('tours').insert({
    id: tourId,
    tour_code: tourCode,
    pattern: `[${TEST_MARKER}] e2e ${runId}`,
    agency_name: TEST_MARKER,
    start_date: fmt(start),
    end_date: fmt(end),
    pax_count: 12,
    vehicle_type: '29인승',
    guide_id: guideId,
    tc_name: `${TEST_MARKER}-TC`,
    branch_id: branchId,
    created_by: adminId,
  })
  if (tourErr) throw new Error(tourErr.message)

  const { error: settErr } = await guideClient.from('settlements').insert({
    id: settlementId,
    tour_id: tourId,
    guide_id: guideId,
    branch_id: branchId,
    year_month: fmt(start).slice(0, 7),
    status: 'draft',
    exchange_rate: 26000,
    advance_vnd: 0,
    tour_fee_usd: 0,
    ground_fee_usd: 0,
    charming_other_usd: 0,
    tip_received_usd: 0,
    option_receivable_usd: 0,
    tip_transfer_usd: 0,
    option_credit_usd: 0,
    vehicle_fee_usd: 0,
    head_tax_usd: 0,
    seoul_biz_fee_usd: 0,
    tc_guide_usd: 0,
    tc_company_usd: 0,
    megugi_usd: 0,
    guide_daily_fee_usd: 0,
    settlement_ratio: 1,
    guide_note: `${TEST_MARKER} e2e ${runId}`,
  })
  if (settErr) throw new Error(settErr.message)

  await guideSubmit(guideClient, settlementId, guideId)
  await sendForConfirmation(adminClient, settlementId, adminId)

  return { runId, tourId, settlementId, tourCode }
}

const LINE_ITEM_TABLES = [
  'hotel_items',
  'meal_items',
  'entrance_items',
  'other_expense_items',
  'shopping_items',
  'option_items',
  'company_expense_items',
  'receipts',
]

const AUDIT_TABLES = [
  'settlement_field_changes',
  'settlement_audit_events',
  'settlement_confirmations',
  'settlement_status_logs',
  'settlement_snapshots',
]

export async function cleanupWorkflowFixture(
  adminClient: SupabaseClient,
  fixture: WorkflowFixture,
) {
  const { settlementId, tourId } = fixture
  const errors: string[] = []

  const tryOp = async (
    label: string,
    fn: () => PromiseLike<{ error: { message: string } | null }>,
  ) => {
    const { error } = await fn()
    if (error) errors.push(`${label}: ${error.message}`)
  }

  if (settlementId) {
    await tryOp('clear FK', async () =>
      adminClient
        .from('settlements')
        .update({ guide_submit_snapshot_id: null, active_confirmation_id: null })
        .eq('id', settlementId),
    )
    await tryOp('confirmations', async () =>
      adminClient.from('settlement_confirmations').delete().eq('settlement_id', settlementId),
    )
    for (const table of LINE_ITEM_TABLES) {
      await tryOp(table, async () =>
        adminClient.from(table).delete().eq('settlement_id', settlementId),
      )
    }
    for (const table of AUDIT_TABLES) {
      await tryOp(table, async () =>
        adminClient.from(table).delete().eq('settlement_id', settlementId),
      )
    }
    await tryOp('settlements', async () =>
      adminClient.from('settlements').delete().eq('id', settlementId),
    )
  }
  if (tourId) {
    await tryOp('tours', async () => adminClient.from('tours').delete().eq('id', tourId))
  }

  if (errors.length) throw new Error(`cleanup: ${errors.join('; ')}`)
}
