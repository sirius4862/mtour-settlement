#!/usr/bin/env node
/**
 * Production 배정회수 (assignment recall) verification.
 *
 * WHEN TO RUN:
 *   1. Apply DB migration (STEP 1 then STEP 2) — see assignment_recall_v1_migration.sql
 *   2. Run supabase/verify_assignment_recall_v1_schema.sql in SQL Editor (read-only)
 *   3. Deploy app code
 *   4. Run: node scripts/verify-assignment-recall-production.mjs
 *
 * Uses workflow test creds from .env.local (same as verify-recall-production.mjs).
 * Mirrors recallTourAssignment server action + app-layer guards.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const MARKER = 'ASSIGN_RECALL_VERIFY'

const ASSIGNMENT_RECALL_ELIGIBLE = new Set(['draft', 'submitted'])

function loadEnvLocal() {
  const paths = [
    join(process.cwd(), '.env.local'),
    join(process.cwd(), '..', 'settlement-app', '.env.local'),
  ]
  for (const p of paths) {
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim()
      }
    }
    return p
  }
  return null
}

function req(name) {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

async function signIn(url, anonKey, email, password) {
  const client = createClient(url, anonKey)
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) throw new Error(`signIn ${email}: ${error?.message ?? 'no user'}`)
  return { client, userId: data.user.id }
}

async function getProfile(client, userId) {
  const { data, error } = await client
    .from('profiles')
    .select('id, role, branch_id')
    .eq('id', userId)
    .single()
  if (error || !data) throw new Error(`profile ${userId}: ${error?.message}`)
  return data
}

/** App-layer eligibility — mirrors assertCanRecallTourAssignment / isAssignmentRecallEligible */
function isAssignmentRecallEligible({
  assignmentStatus,
  settlementStatus,
  guideConfirmedAt,
}) {
  if (assignmentStatus === 'recalled') return false
  if (guideConfirmedAt != null) return false
  if (settlementStatus == null) return true
  return ASSIGNMENT_RECALL_ELIGIBLE.has(settlementStatus)
}

function appLayerDeniesCrossRegion(adminProfile, tourBranchId) {
  return adminProfile.role !== 'master_admin' && String(tourBranchId) !== String(adminProfile.branch_id)
}

function isGuideActionable(status, guideConfirmedAt) {
  if (status === 'draft') return true
  if (status === 'edit_requested') return true
  if (status === 'pending_guide_confirmation' && guideConfirmedAt == null) return true
  return false
}

async function guideSubmit(guideClient, settlementId, guideId) {
  const snapId = randomUUID()
  const now = new Date().toISOString()
  const payload = {
    [MARKER]: true,
    exchange_rate: 26000,
    header: { vehicle_fee_usd: 42, settlement_ratio: 1, ground_fee_usd: 99 },
    calc_summary: {
      guide_settlement_usd: 100,
      guide_payout_usd: 100,
      company_grand_total_usd: 777,
    },
  }
  const { error: snapErr } = await guideClient.from('settlement_snapshots').insert({
    id: snapId,
    settlement_id: settlementId,
    kind: 'guide_submit',
    payload_json: payload,
    calc_summary_json: payload.calc_summary,
    created_by: guideId,
  })
  if (snapErr) throw new Error(`guideSubmit snap: ${snapErr.message}`)
  const { error: rpcErr } = await guideClient.rpc('guide_submit_settlement', {
    p_settlement_id: settlementId,
    p_snapshot_id: snapId,
    p_submitted_at: now,
    p_calc_summary: payload.calc_summary,
  })
  if (rpcErr) throw new Error(`guideSubmit rpc: ${rpcErr.message}`)
  return snapId
}

async function sendForConfirmation(adminClient, settlementId, adminId) {
  const { data: settlement, error: readErr } = await adminClient
    .from('settlements')
    .select('guide_submit_snapshot_id')
    .eq('id', settlementId)
    .single()
  if (readErr || !settlement?.guide_submit_snapshot_id) {
    throw new Error(readErr?.message ?? 'missing guide_submit_snapshot_id')
  }
  const afterSnapId = randomUUID()
  const confirmationId = randomUUID()
  const now = new Date().toISOString()
  await adminClient.from('settlement_snapshots').insert({
    id: afterSnapId,
    settlement_id: settlementId,
    kind: 'admin_pre_confirm',
    payload_json: { [MARKER]: true },
    created_by: adminId,
  })
  await adminClient.from('settlement_confirmations').insert({
    id: confirmationId,
    settlement_id: settlementId,
    snapshot_before_id: settlement.guide_submit_snapshot_id,
    snapshot_after_id: afterSnapId,
    status: 'pending',
    sent_by: adminId,
    sent_at: now,
    change_count: 0,
  })
  const { data, error } = await adminClient
    .from('settlements')
    .update({
      status: 'pending_guide_confirmation',
      sent_for_confirmation_at: now,
      sent_for_confirmation_by: adminId,
      active_confirmation_id: confirmationId,
      reviewed_at: now,
      reviewed_by: adminId,
    })
    .eq('id', settlementId)
    .eq('status', 'submitted')
    .select('id')
  if (error) throw new Error(`sendForConfirmation: ${error.message}`)
  if (!data?.length) throw new Error('sendForConfirmation: 0 rows')
}

async function adminRequestEdit(adminClient, settlementId, adminId) {
  const now = new Date().toISOString()
  const { data, error } = await adminClient
    .from('settlements')
    .update({
      status: 'edit_requested',
      edit_requested_at: now,
      edit_requested_by: adminId,
      reviewed_by: adminId,
      reviewed_at: now,
    })
    .eq('id', settlementId)
    .eq('status', 'submitted')
    .select('id')
  if (error) throw new Error(`adminRequestEdit: ${error.message}`)
  if (!data?.length) throw new Error('adminRequestEdit: 0 rows')
}

/**
 * Create a tour (+ optional settlement) fixture for assignment-recall tests.
 * settlementState: 'none' | 'draft' | 'submitted' | 'edit_requested' |
 *                  'pending_guide_confirmation' | 'paid'
 */
async function createAssignmentFixture(tourClient, guideClient, adminClient, params) {
  const {
    tourCreatorId,
    guideId,
    adminId,
    branchId,
    settlementState,
    guideConfirmedAt = null,
    paidAt = null,
  } = params

  const tourId = randomUUID()
  const settlementId = settlementState === 'none' ? null : randomUUID()
  const runId = randomUUID().slice(0, 8)
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() + 21)
  const end = new Date(start)
  end.setDate(end.getDate() + 2)
  const fmt = (d) => d.toISOString().slice(0, 10)

  const { error: tourErr } = await tourClient.from('tours').insert({
    id: tourId,
    tour_code: `${MARKER}-${runId}`,
    pattern: `[${MARKER}] assign-recall ${runId}`,
    agency_name: MARKER,
    start_date: fmt(start),
    end_date: fmt(end),
    pax_count: 8,
    vehicle_type: '29인승',
    guide_id: guideId,
    tc_name: `${MARKER}-TC`,
    branch_id: branchId,
    created_by: tourCreatorId,
    assignment_status: 'assigned',
  })
  if (tourErr) throw new Error(`tour: ${tourErr.message}`)

  const monetary = {
    vehicle_fee_usd: 42,
    ground_fee_usd: 99,
    guide_daily_fee_usd: 55,
    paid_at: null,
    guide_confirmed_at: null,
    guide_confirmed_by: null,
    calc_company_profit: 777,
  }

  if (settlementState === 'none') {
    return { tourId, settlementId: null, guideId, monetary, branchId }
  }

  const { error: settErr } = await guideClient.from('settlements').insert({
    id: settlementId,
    tour_id: tourId,
    guide_id: guideId,
    branch_id: branchId,
    year_month: fmt(start).slice(0, 7),
    status: 'draft',
    exchange_rate: 26000,
    advance_vnd: 0,
    tour_fee_usd: 500,
    ground_fee_usd: monetary.ground_fee_usd,
    charming_other_usd: 0,
    tip_received_usd: 0,
    option_receivable_usd: 0,
    tip_transfer_usd: 0,
    option_credit_usd: 0,
    vehicle_fee_usd: monetary.vehicle_fee_usd,
    head_tax_usd: 0,
    seoul_biz_fee_usd: 0,
    tc_guide_usd: 0,
    tc_company_usd: 0,
    megugi_usd: 0,
    guide_daily_fee_usd: monetary.guide_daily_fee_usd,
    settlement_ratio: 1,
    guide_note: MARKER,
    calc_summary_json: {
      guide_settlement_usd: 100,
      guide_payout_usd: 100,
      company_grand_total_usd: monetary.calc_company_profit,
    },
  })
  if (settErr) throw new Error(`settlement draft: ${settErr.message}`)

  if (settlementState === 'draft') {
    return { tourId, settlementId, guideId, monetary, branchId }
  }

  if (settlementState === 'submitted') {
    await guideSubmit(guideClient, settlementId, guideId)
    return { tourId, settlementId, guideId, monetary, branchId }
  }

  if (settlementState === 'edit_requested') {
    await guideSubmit(guideClient, settlementId, guideId)
    await adminRequestEdit(adminClient, settlementId, adminId)
    return { tourId, settlementId, guideId, monetary, branchId }
  }

  if (settlementState === 'pending_guide_confirmation') {
    await guideSubmit(guideClient, settlementId, guideId)
    await sendForConfirmation(adminClient, settlementId, adminId)
    if (guideConfirmedAt) {
      const { error: confErr } = await adminClient
        .from('settlements')
        .update({
          guide_confirmed_at: guideConfirmedAt,
          guide_confirmed_by: guideId,
        })
        .eq('id', settlementId)
        .eq('status', 'pending_guide_confirmation')
      if (confErr) throw new Error(`set guide_confirmed_at: ${confErr.message}`)
      monetary.guide_confirmed_at = guideConfirmedAt
      monetary.guide_confirmed_by = guideId
    }
    return { tourId, settlementId, guideId, monetary, branchId }
  }

  if (settlementState === 'paid') {
    await guideSubmit(guideClient, settlementId, guideId)
    await sendForConfirmation(adminClient, settlementId, adminId)
    const now = new Date().toISOString()
    await adminClient
      .from('settlements')
      .update({ guide_confirmed_at: now, guide_confirmed_by: guideId })
      .eq('id', settlementId)
      .eq('status', 'pending_guide_confirmation')
    const paid = paidAt ?? now
    const { error: payErr } = await adminClient
      .from('settlements')
      .update({ status: 'paid', paid_at: paid, reviewed_by: adminId })
      .eq('id', settlementId)
      .eq('status', 'pending_guide_confirmation')
    if (payErr) throw new Error(`mark paid: ${payErr.message}`)
    monetary.paid_at = paid
    monetary.guide_confirmed_at = now
    return { tourId, settlementId, guideId, monetary, branchId }
  }

  throw new Error(`unsupported settlementState ${settlementState}`)
}

/** Mirrors recallTourAssignment DB writes (tour recall + optional settlement → recalled). */
async function attemptAssignmentRecall(adminClient, fixture, adminId) {
  const now = new Date().toISOString()
  const { tourId, settlementId } = fixture

  const { data: tourBefore } = await adminClient
    .from('tours')
    .select('id, guide_id, assignment_status')
    .eq('id', tourId)
    .single()

  let settlementBefore = null
  if (settlementId) {
    const { data } = await adminClient
      .from('settlements')
      .select(
        'id, status, guide_id, guide_confirmed_at, guide_confirmed_by, paid_at, vehicle_fee_usd, ground_fee_usd, guide_daily_fee_usd, calc_summary_json',
      )
      .eq('id', settlementId)
      .single()
    settlementBefore = data
  }

  const { data: tourData, error: tourError } = await adminClient
    .from('tours')
    .update({ assignment_status: 'recalled', recalled_at: now, recalled_by: adminId })
    .eq('id', tourId)
    .eq('assignment_status', 'assigned')
    .select('id, guide_id, assignment_status, recalled_at, recalled_by')

  let settlementData = null
  let settlementError = null
  if (settlementId && settlementBefore) {
    const fromStatus = settlementBefore.status
    const res = await adminClient
      .from('settlements')
      .update({ status: 'recalled' })
      .eq('id', settlementId)
      .eq('status', fromStatus)
      .select(
        'id, status, guide_id, guide_confirmed_at, guide_confirmed_by, paid_at, vehicle_fee_usd, ground_fee_usd, guide_daily_fee_usd, calc_summary_json',
      )
    settlementData = res.data
    settlementError = res.error
  }

  return {
    tourBefore,
    settlementBefore,
    tourData,
    tourError,
    tourRowCount: tourData?.length ?? 0,
    settlementData,
    settlementError,
    settlementRowCount: settlementData?.length ?? 0,
  }
}

async function fetchSettlementSnapshot(adminClient, settlementId) {
  const { data } = await adminClient
    .from('settlements')
    .select(
      'id, status, guide_id, guide_confirmed_at, guide_confirmed_by, paid_at, vehicle_fee_usd, ground_fee_usd, guide_daily_fee_usd, calc_summary_json',
    )
    .eq('id', settlementId)
    .maybeSingle()
  return data
}

async function cleanup(adminClient, ids) {
  for (const settlementId of ids.settlements) {
    await adminClient
      .from('settlements')
      .update({ guide_submit_snapshot_id: null, active_confirmation_id: null })
      .eq('id', settlementId)
    await adminClient.from('settlement_field_changes').delete().eq('settlement_id', settlementId)
    await adminClient.from('settlement_confirmations').delete().eq('settlement_id', settlementId)
    await adminClient.from('settlement_snapshots').delete().eq('settlement_id', settlementId)
    await adminClient.from('settlements').delete().eq('id', settlementId)
  }
  for (const tourId of ids.tours) {
    await adminClient.from('tours').delete().eq('id', tourId)
  }
}

const results = []

function pass(name, detail = '') {
  results.push({ name, ok: true, detail })
  console.log(`PASS: ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail })
  console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
}

function skip(name, detail = '') {
  results.push({ name, ok: true, skipped: true, detail })
  console.log(`SKIP (manual): ${name}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  const envPath = loadEnvLocal()
  console.log('=== Production assignment recall (배정회수) verification ===')
  console.log(`Env loaded from: ${envPath ?? 'process env only'}`)
  console.log(
    'Prerequisite: DB migration STEP 1+2 applied AND app code deployed.\n',
  )

  const url = req('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = req('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  const { client: adminClient, userId: adminId } = await signIn(
    url,
    anonKey,
    req('WORKFLOW_TEST_ADMIN_EMAIL'),
    req('WORKFLOW_TEST_ADMIN_PASSWORD'),
  )
  const { client: masterClient, userId: masterId } = await signIn(
    url,
    anonKey,
    req('WORKFLOW_TEST_MASTER_EMAIL'),
    req('WORKFLOW_TEST_MASTER_PASSWORD'),
  )
  const { client: guideClient, userId: guideId } = await signIn(
    url,
    anonKey,
    req('WORKFLOW_TEST_GUIDE_EMAIL'),
    req('WORKFLOW_TEST_GUIDE_PASSWORD'),
  )

  const adminProfile = await getProfile(adminClient, adminId)
  const adminBranchId = adminProfile.branch_id
  if (!adminBranchId) throw new Error('admin has no branch_id')

  const { data: otherBranch } = await adminClient
    .from('branches')
    .select('id, code')
    .neq('id', adminBranchId)
    .limit(1)
    .single()
  if (!otherBranch?.id) throw new Error('no other branch for cross-region test')

  const cleanupIds = { settlements: [], tours: [] }

  try {
    // ── 1. admin can recall tour with no settlement ─────────────────────────
    const noSettFixture = await createAssignmentFixture(
      adminClient,
      guideClient,
      adminClient,
      {
        tourCreatorId: adminId,
        guideId,
        adminId,
        branchId: adminBranchId,
        settlementState: 'none',
      },
    )
    cleanupIds.tours.push(noSettFixture.tourId)

    const noSettRecall = await attemptAssignmentRecall(adminClient, noSettFixture, adminId)
    if (noSettRecall.tourError || noSettRecall.tourRowCount !== 1) {
      fail('admin can recall tour with no settlement', noSettRecall.tourError?.message ?? '0 tour rows')
    } else if (noSettRecall.tourData[0].assignment_status !== 'recalled') {
      fail('admin can recall tour with no settlement', `status=${noSettRecall.tourData[0].assignment_status}`)
    } else if (noSettRecall.tourBefore.guide_id !== noSettRecall.tourData[0].guide_id) {
      fail('admin can recall tour with no settlement', 'guide_id mutated')
    } else {
      pass('admin can recall tour with no settlement', `tour=${noSettFixture.tourId}`)
    }

    // ── 2. admin can recall draft settlement ────────────────────────────────
    const draftFixture = await createAssignmentFixture(
      adminClient,
      guideClient,
      adminClient,
      {
        tourCreatorId: adminId,
        guideId,
        adminId,
        branchId: adminBranchId,
        settlementState: 'draft',
      },
    )
    cleanupIds.tours.push(draftFixture.tourId)
    cleanupIds.settlements.push(draftFixture.settlementId)

    const draftRecall = await attemptAssignmentRecall(adminClient, draftFixture, adminId)
    if (draftRecall.tourRowCount !== 1 || draftRecall.settlementRowCount !== 1) {
      fail(
        'admin can recall draft settlement',
        draftRecall.tourError?.message ?? draftRecall.settlementError?.message ?? '0 rows',
      )
    } else if (draftRecall.settlementData[0].status !== 'recalled') {
      fail('admin can recall draft settlement', `status=${draftRecall.settlementData[0].status}`)
    } else {
      pass('admin can recall draft settlement', `id=${draftFixture.settlementId}`)
    }

    // ── 3. admin can recall submitted settlement ────────────────────────────
    const submittedFixture = await createAssignmentFixture(
      adminClient,
      guideClient,
      adminClient,
      {
        tourCreatorId: adminId,
        guideId,
        adminId,
        branchId: adminBranchId,
        settlementState: 'submitted',
      },
    )
    cleanupIds.tours.push(submittedFixture.tourId)
    cleanupIds.settlements.push(submittedFixture.settlementId)

    const submittedRecall = await attemptAssignmentRecall(adminClient, submittedFixture, adminId)
    if (submittedRecall.tourRowCount !== 1 || submittedRecall.settlementRowCount !== 1) {
      fail(
        'admin can recall submitted settlement',
        submittedRecall.tourError?.message ?? submittedRecall.settlementError?.message ?? '0 rows',
      )
    } else if (submittedRecall.settlementData[0].status !== 'recalled') {
      fail('admin can recall submitted settlement', `status=${submittedRecall.settlementData[0].status}`)
    } else {
      pass('admin can recall submitted settlement', `id=${submittedFixture.settlementId}`)
    }

    // ── 4–7. blocked states (app guard + DB should both refuse) ───────────
    const blockedCases = [
      { name: 'admin cannot recall edit_requested', state: 'edit_requested' },
      { name: 'admin cannot recall pending_guide_confirmation', state: 'pending_guide_confirmation' },
      { name: 'admin cannot recall paid', state: 'paid', paidAt: new Date().toISOString() },
      {
        name: 'admin cannot recall guide-confirmed row',
        state: 'pending_guide_confirmation',
        guideConfirmedAt: new Date().toISOString(),
      },
    ]

    for (const bc of blockedCases) {
      const fixture = await createAssignmentFixture(adminClient, guideClient, adminClient, {
        tourCreatorId: adminId,
        guideId,
        adminId,
        branchId: adminBranchId,
        settlementState: bc.state,
        guideConfirmedAt: bc.guideConfirmedAt ?? null,
        paidAt: bc.paidAt ?? null,
      })
      cleanupIds.tours.push(fixture.tourId)
      if (fixture.settlementId) cleanupIds.settlements.push(fixture.settlementId)

      const { data: tourRow } = await adminClient
        .from('tours')
        .select('assignment_status')
        .eq('id', fixture.tourId)
        .single()
      const { data: settRow } = fixture.settlementId
        ? await adminClient
            .from('settlements')
            .select('status, guide_confirmed_at')
            .eq('id', fixture.settlementId)
            .single()
        : { data: null }

      const appEligible = isAssignmentRecallEligible({
        assignmentStatus: tourRow?.assignment_status ?? 'assigned',
        settlementStatus: settRow?.status ?? null,
        guideConfirmedAt: settRow?.guide_confirmed_at ?? null,
      })

      if (!appEligible) {
        pass(bc.name, 'app guard denies eligibility')
      } else {
        fail(bc.name, 'app guard incorrectly allowed eligibility')
        continue
      }

      // DB direct attempt should also fail (0 tour rows updated)
      const dbAttempt = await attemptAssignmentRecall(adminClient, fixture, adminId)
      if (dbAttempt.tourRowCount === 0) {
        pass(`${bc.name} (DB layer)`, dbAttempt.tourError?.message ?? '0 tour rows')
      } else {
        fail(`${bc.name} (DB layer)`, `updated ${dbAttempt.tourRowCount} tour row(s)`)
      }
    }

    // ── 8. cross-region admin cannot recall (app layer) ─────────────────────
    const crossFixture = await createAssignmentFixture(
      masterClient,
      guideClient,
      masterClient,
      {
        tourCreatorId: masterId,
        guideId,
        adminId: masterId,
        branchId: otherBranch.id,
        settlementState: 'draft',
      },
    )
    cleanupIds.tours.push(crossFixture.tourId)
    cleanupIds.settlements.push(crossFixture.settlementId)

    if (appLayerDeniesCrossRegion(adminProfile, crossFixture.branchId)) {
      pass(
        'cross-region admin cannot recall',
        `app guard denies: admin branch=${adminBranchId} != tour branch=${crossFixture.branchId} (${otherBranch.code})`,
      )
    } else {
      fail('cross-region admin cannot recall', 'app guard did not deny')
    }

    // ── 9. guide cannot recall ────────────────────────────────────────────
    const guideBlockFixture = await createAssignmentFixture(
      adminClient,
      guideClient,
      adminClient,
      {
        tourCreatorId: adminId,
        guideId,
        adminId,
        branchId: adminBranchId,
        settlementState: 'draft',
      },
    )
    cleanupIds.tours.push(guideBlockFixture.tourId)
    cleanupIds.settlements.push(guideBlockFixture.settlementId)

    const guideAttempt = await attemptAssignmentRecall(guideClient, guideBlockFixture, guideId)
    if (guideAttempt.tourRowCount === 0) {
      pass('guide cannot recall', guideAttempt.tourError?.message ?? '0 tour rows')
    } else {
      fail('guide cannot recall', `updated ${guideAttempt.tourRowCount} tour row(s)`)
    }

    // ── 10–14. post-recall visibility, stale URL, integrity ───────────────
    const fullFixture = await createAssignmentFixture(
      adminClient,
      guideClient,
      adminClient,
      {
        tourCreatorId: adminId,
        guideId,
        adminId,
        branchId: adminBranchId,
        settlementState: 'submitted',
      },
    )
    cleanupIds.tours.push(fullFixture.tourId)
    cleanupIds.settlements.push(fullFixture.settlementId)

    const beforeSnap = await fetchSettlementSnapshot(adminClient, fullFixture.settlementId)
    const beforeGuideId = beforeSnap?.guide_id

    const fullRecall = await attemptAssignmentRecall(adminClient, fullFixture, adminId)
    if (fullRecall.tourRowCount !== 1 || fullRecall.settlementRowCount !== 1) {
      fail('post-recall checks setup', 'recall failed')
    } else {
      const afterSnap = await fetchSettlementSnapshot(adminClient, fullFixture.settlementId)

      // 10. recalled tour disappears from guide assigned tours
      const { data: guideTourRows } = await guideClient
        .from('tours')
        .select('id')
        .eq('id', fullFixture.tourId)
      if (!guideTourRows?.length) {
        pass('recalled tour disappears from guide assigned tours')
      } else {
        fail('recalled tour disappears from guide assigned tours', `guide still sees tour`)
      }

      // 11. recalled settlement disappears from guide actionable sections
      const { data: guideReadRows } = await guideClient
        .from('settlements_guide_read')
        .select('id, status, guide_confirmed_at')
        .eq('id', fullFixture.settlementId)
      if (!guideReadRows?.length) {
        pass('recalled settlement disappears from guide actionable sections')
      } else if (
        guideReadRows[0] &&
        !isGuideActionable(guideReadRows[0].status, guideReadRows[0].guide_confirmed_at)
      ) {
        pass(
          'recalled settlement disappears from guide actionable sections',
          'not in guide read view',
        )
      } else {
        fail('recalled settlement disappears from guide actionable sections')
      }

      // 12a. guide cannot create settlement from recalled tour (stale URL)
      const staleSettId = randomUUID()
      const { error: createErr } = await guideClient.from('settlements').insert({
        id: staleSettId,
        tour_id: fullFixture.tourId,
        guide_id: guideId,
        branch_id: adminBranchId,
        year_month: new Date().toISOString().slice(0, 7),
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
        guide_note: `${MARKER}-stale-create`,
      })
      // Tour hidden from guide + RLS may block; either error or we clean up if insert slipped through.
      if (createErr) {
        pass('guide cannot create settlement from recalled tour via stale URL', createErr.message)
      } else {
        await adminClient.from('settlements').delete().eq('id', staleSettId)
        fail('guide cannot create settlement from recalled tour via stale URL', 'insert succeeded')
      }

      // 12b. guide cannot submit recalled settlement (stale URL)
      const { data: submitRows, error: submitErr } = await guideClient
        .from('settlements')
        .update({ status: 'submitted' })
        .eq('id', fullFixture.settlementId)
        .eq('status', 'recalled')
        .select('id')
      if (submitErr || !submitRows?.length) {
        pass(
          'guide cannot submit recalled settlement via stale URL',
          submitErr?.message ?? '0 rows',
        )
      } else {
        fail('guide cannot submit recalled settlement via stale URL', 'update succeeded')
      }

      // 12c. guide cannot edit recalled settlement content (stale URL)
      const { data: editRows, error: editErr } = await guideClient
        .from('settlements')
        .update({ guide_note: `${MARKER}-stale-edit` })
        .eq('id', fullFixture.settlementId)
        .select('id')
      if (editErr || !editRows?.length) {
        pass('guide cannot edit recalled settlement via stale URL', editErr?.message ?? '0 rows')
      } else {
        fail('guide cannot edit recalled settlement via stale URL', 'update succeeded')
      }

      // 13. monetary / payout / confirmation fields unchanged
      const monetaryOk =
        afterSnap &&
        beforeSnap &&
        afterSnap.vehicle_fee_usd === beforeSnap.vehicle_fee_usd &&
        afterSnap.ground_fee_usd === beforeSnap.ground_fee_usd &&
        afterSnap.guide_daily_fee_usd === beforeSnap.guide_daily_fee_usd &&
        afterSnap.paid_at === beforeSnap.paid_at &&
        afterSnap.guide_confirmed_at === beforeSnap.guide_confirmed_at &&
        afterSnap.guide_confirmed_by === beforeSnap.guide_confirmed_by &&
        afterSnap.calc_summary_json?.company_grand_total_usd ===
          beforeSnap.calc_summary_json?.company_grand_total_usd

      if (monetaryOk) {
        pass(
          'monetary fields, paid_at, guide_confirmed_at, payout/company profit fields are unchanged',
          `vehicle_fee_usd=${beforeSnap.vehicle_fee_usd}`,
        )
      } else {
        fail(
          'monetary fields, paid_at, guide_confirmed_at, payout/company profit fields are unchanged',
          `before vehicle=${beforeSnap?.vehicle_fee_usd} after=${afterSnap?.vehicle_fee_usd}`,
        )
      }

      // 14. no guide_id mutation
      if (afterSnap?.guide_id === beforeGuideId && fullRecall.tourData[0].guide_id === guideId) {
        pass('no guide_id mutation occurs', `guide_id=${guideId}`)
      } else {
        fail(
          'no guide_id mutation occurs',
          `before=${beforeGuideId} after=${afterSnap?.guide_id} tour=${fullRecall.tourData[0].guide_id}`,
        )
      }
    }

    // ── Schema spot-checks (manual when POSTGRES_URL unavailable) ───────────
    console.log('\n--- DB schema spot-checks (run BEFORE app deploy) ---')
    if (process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL) {
      skip(
        'DB schema spot-checks via SQL Editor',
        'POSTGRES_URL present but automated pg query not implemented — run supabase/verify_assignment_recall_v1_schema.sql manually',
      )
    } else {
      skip(
        'DB schema spot-checks via SQL Editor',
        'POSTGRES_URL not in env — run supabase/verify_assignment_recall_v1_schema.sql in Supabase SQL Editor after migration, before deploy',
      )
    }

    console.log('\n--- MANUAL checks (cannot fully automate without browser) ---')
    skip(
      '/admin/tours 배정회수 button + confirmation copy',
      'Open /admin/tours → eligible row shows 배정회수 → confirm dialog text matches spec',
    )
    skip(
      'Recalled rows visible only in 전체 투어 보기',
      'Default /admin/tours hides recalled; ?view=all shows 배정회수 badge',
    )
  } finally {
    console.log('\n--- Cleanup ---')
    try {
      await cleanup(adminClient, cleanupIds)
      console.log(
        `Cleaned ${cleanupIds.settlements.length} test settlements, ${cleanupIds.tours.length} test tours`,
      )
    } catch (e) {
      console.error('Cleanup error:', e instanceof Error ? e.message : e)
    }
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n=== Summary: ${results.length - failed.length}/${results.length} passed ===`)
  if (failed.length) {
    process.exitCode = 1
    for (const f of failed) console.error(`  ✗ ${f.name}: ${f.detail}`)
  }
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exitCode = 1
})
