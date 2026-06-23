#!/usr/bin/env node
/**
 * Apply settlement_workflow_v1_admin_send_confirmation_rpc.sql via POSTGRES_URL / DATABASE_URL.
 * Staging only — refuses production ref xqkdsgjwftfaacvppxag.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'
import {
  PRODUCTION_SUPABASE_REF,
  refuseProductionDbUrl,
} from './lib/supabase-project-ref.mjs'

function loadEnvLocal() {
  const p = join(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
}

loadEnvLocal()

const dbUrl =
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL ??
  process.env.SUPABASE_DB_URL ??
  ''

const guard = refuseProductionDbUrl(dbUrl, 'apply-admin-send-confirmation-rpc')
if (!guard.ok) {
  console.error(guard.error)
  console.error(
    `Configure DATABASE_URL for a non-production Supabase project (not ${PRODUCTION_SUPABASE_REF}).`,
  )
  process.exit(1)
}

if (!dbUrl.trim()) {
  console.error('Refusing: DATABASE_URL / POSTGRES_URL missing.')
  process.exit(1)
}

const sqlPath = join(
  process.cwd(),
  'supabase',
  'settlement_workflow_v1_admin_send_confirmation_rpc.sql',
)
const sql = readFileSync(sqlPath, 'utf8')
const db = postgres(dbUrl, { max: 1 })

try {
  await db.unsafe(sql)
  console.log('Applied admin_send_for_confirmation RPC.')
} finally {
  await db.end()
}
