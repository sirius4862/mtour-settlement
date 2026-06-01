#!/usr/bin/env node
/**
 * RLS smoke test — requires live Supabase + test guide credentials.
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   RLS_SMOKE_GUIDE_EMAIL
 *   RLS_SMOKE_GUIDE_PASSWORD
 *   RLS_SMOKE_SETTLEMENT_ID  (optional — draft/edit_requested settlement owned by guide)
 *
 * Usage:
 *   node scripts/rls-smoke-test.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
const email = process.env.RLS_SMOKE_GUIDE_EMAIL?.trim()
const password = process.env.RLS_SMOKE_GUIDE_PASSWORD
const settlementId = process.env.RLS_SMOKE_SETTLEMENT_ID?.trim()

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exitCode = 1
}

function pass(msg) {
  console.log(`PASS: ${msg}`)
}

function skip(msg) {
  console.log(`SKIP: ${msg}`)
}

async function main() {
  console.log('=== RLS smoke test (guide workflow) ===\n')

  // Static SQL checks (no credentials required)
  const fixSql = readFileSync(
    join(process.cwd(), 'supabase', 'settlement_rls_guide_workflow_fix.sql'),
    'utf8',
  )
  if (!fixSql.includes('settlement_snapshots_guide_insert')) {
    fail('settlement_rls_guide_workflow_fix.sql missing snapshot insert policy')
  } else {
    pass('workflow fix SQL contains settlement_snapshots_guide_insert')
  }
  if (/settlement_snapshots_guide_select/i.test(fixSql)) {
    fail('workflow fix SQL must not add settlement_snapshots_guide_select (redaction)')
  } else {
    pass('workflow fix SQL preserves snapshot redaction (no guide base SELECT)')
  }

  const actionsSource = readFileSync(
    join(process.cwd(), 'src', 'lib', 'actions', 'settlementActions.ts'),
    'utf8',
  )
  const fnMatch = actionsSource.match(/async function insertSnapshot[\s\S]*?\n\}/)
  if (!fnMatch || fnMatch[0].includes('.select(')) {
    fail('settlementActions insertSnapshot still uses INSERT…RETURNING on settlement_snapshots')
  } else {
    pass('settlementActions avoids INSERT…RETURNING on settlement_snapshots')
  }

  if (!url || !anonKey) {
    skip('NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not set — live checks skipped')
    return
  }
  if (!email || !password) {
    skip('RLS_SMOKE_GUIDE_EMAIL / PASSWORD not set — live checks skipped')
    return
  }

  const supabase = createClient(url, anonKey)
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
  if (authErr || !auth.user) {
    fail(`guide login failed: ${authErr?.message ?? 'no user'}`)
    return
  }
  pass(`guide signed in: ${auth.user.id}`)

  // Forbidden: base settlements SELECT
  const { data: baseSettlements, error: baseSelErr } = await supabase
    .from('settlements')
    .select('id, ground_fee_usd')
    .eq('guide_id', auth.user.id)
    .limit(1)
  if (baseSelErr || !baseSettlements?.length) {
    pass('guide cannot SELECT base settlements (RLS blocked or empty — expected block)')
  } else if (baseSettlements[0]?.ground_fee_usd !== undefined) {
    fail('guide can read sensitive columns from base settlements')
  }

  // Allowed: redacted view SELECT
  const { error: viewErr } = await supabase
    .from('settlements_guide_read')
    .select('id, ground_fee_usd')
    .eq('guide_id', auth.user.id)
    .limit(1)
  if (viewErr) {
    fail(`settlements_guide_read SELECT failed: ${viewErr.message}`)
  } else {
    pass('guide can SELECT settlements_guide_read')
  }

  if (!settlementId) {
    skip('RLS_SMOKE_SETTLEMENT_ID not set — snapshot insert test skipped')
    return
  }

  const snapId = randomUUID()
  const { error: snapErr } = await supabase.from('settlement_snapshots').insert({
    id: snapId,
    settlement_id: settlementId,
    kind: 'guide_submit',
    payload_json: { test: true, calc_summary: { company_grand_total_usd: 0 } },
    calc_summary_json: { company_grand_total_usd: 0 },
    created_by: auth.user.id,
  })
  if (snapErr) {
    fail(`guide snapshot INSERT failed: ${snapErr.message}`)
  } else {
    pass('guide snapshot INSERT succeeded (client id, no RETURNING)')
  }

  // Forbidden: base snapshot SELECT (redaction)
  const { data: snapRows, error: snapReadErr } = await supabase
    .from('settlement_snapshots')
    .select('payload_json')
    .eq('id', snapId)
    .maybeSingle()
  if (!snapReadErr && snapRows) {
    fail('guide can SELECT base settlement_snapshots (redaction leak)')
  } else {
    pass('guide cannot SELECT base settlement_snapshots')
  }

  // Cleanup test row if service role not available — best effort delete may fail under RLS (OK)
  await supabase.from('settlement_snapshots').delete().eq('id', snapId)

  await supabase.auth.signOut()
  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
