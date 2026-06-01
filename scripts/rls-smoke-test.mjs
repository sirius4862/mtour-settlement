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

const LINE_ITEM_TABLES = [
  'hotel_items',
  'meal_items',
  'entrance_items',
  'other_expense_items',
  'shopping_items',
  'option_items',
  'receipts',
]

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

  const lineItemFixSql = readFileSync(
    join(process.cwd(), 'supabase', 'settlement_rls_line_items_guide_write_fix.sql'),
    'utf8',
  )
  for (const table of LINE_ITEM_TABLES) {
    if (!lineItemFixSql.includes(`'public.${table}'::regclass`)) {
      fail(`line items fix SQL missing ${table}`)
    }
  }
  if (/CREATE POLICY \w+_guide_select/i.test(lineItemFixSql)) {
    fail('line items fix SQL must not add guide base SELECT (redaction)')
  } else {
    pass('line items fix SQL covers all 7 tables without guide base SELECT')
  }

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
  const snapFnMatch = actionsSource.match(/async function insertSnapshot[\s\S]*?\n\}/)
  if (!snapFnMatch || snapFnMatch[0].includes('.select(')) {
    fail('settlementActions insertSnapshot still uses INSERT…RETURNING on settlement_snapshots')
  } else {
    pass('settlementActions avoids INSERT…RETURNING on settlement_snapshots')
  }

  const persistFnMatch = actionsSource.match(
    /async function persistSettlementLineItems[\s\S]*?\n\}/,
  )
  if (!persistFnMatch || persistFnMatch[0].includes('.upsert(')) {
    fail('persistSettlementLineItems still uses upsert on line-item tables')
  } else {
    pass('persistSettlementLineItems avoids upsert/RETURNING on line-item tables')
  }

  const persistHelper = readFileSync(
    join(process.cwd(), 'src', 'lib', 'settlement', 'guide-line-item-persist.ts'),
    'utf8',
  )
  if (persistHelper.includes('.upsert(') || persistHelper.includes('.select(')) {
    fail('guide-line-item-persist still uses upsert or RETURNING')
  } else {
    pass('guide-line-item-persist uses insert + per-row update only')
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
    skip('RLS_SMOKE_SETTLEMENT_ID not set — live write checks skipped')
    await supabase.auth.signOut()
    console.log('\nDone.')
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

  await supabase.from('settlement_snapshots').delete().eq('id', snapId)

  const mealId = randomUUID()
  const { error: mealInsErr } = await supabase.from('meal_items').insert({
    id: mealId,
    settlement_id: settlementId,
    meal_date: '2025-01-01',
    restaurant_name: 'RLS smoke test',
    pax: 1,
    unit_price_vnd: 1000,
    amount_vnd: 1000,
    sort_order: 9999,
  })
  if (mealInsErr) {
    fail(`guide meal_items INSERT failed (apply line-items SQL fix): ${mealInsErr.message}`)
  } else {
    pass('guide meal_items INSERT succeeded (no RETURNING)')
  }

  const { error: mealUpdErr } = await supabase
    .from('meal_items')
    .update({ restaurant_name: 'RLS smoke updated' })
    .eq('id', mealId)
    .eq('settlement_id', settlementId)
  if (mealUpdErr) {
    fail(`guide meal_items UPDATE failed: ${mealUpdErr.message}`)
  } else {
    pass('guide meal_items UPDATE succeeded')
  }

  const { data: mealRead, error: mealReadErr } = await supabase
    .from('meal_items')
    .select('id')
    .eq('id', mealId)
    .maybeSingle()
  if (!mealReadErr && mealRead) {
    fail('guide can SELECT base meal_items (should use meal_items_guide_read)')
  } else {
    pass('guide cannot SELECT base meal_items')
  }

  await supabase.from('meal_items').delete().eq('id', mealId)

  await supabase.auth.signOut()
  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
