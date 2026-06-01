import postgres from 'postgres'

const MIGRATION_STATEMENTS = [
  `ALTER TABLE settlements
    ADD COLUMN IF NOT EXISTS option_receivable_usd numeric NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tip_transfer_usd numeric NOT NULL DEFAULT 0`,
  `COMMENT ON COLUMN settlements.option_receivable_usd IS '옵션외상 — option paid to company account, not guide on-site cash (P75 component)'`,
  `COMMENT ON COLUMN settlements.tip_transfer_usd IS '팁송금 — tip transferred to company account, not guide on-site cash (P75 component)'`,
  `COMMENT ON COLUMN settlements.option_credit_usd IS 'Legacy P75 total; kept in sync as option_receivable_usd + tip_transfer_usd'`,
] as const

function resolveDatabaseUrl(): string | null {
  return (
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL ??
    process.env.SUPABASE_DB_URL ??
    null
  )
}

import { resolveMigrationAuthKey as resolveDedicatedMigrationKey } from '@/lib/internal/migration-auth'

export function resolveMigrationAuthKey(): string | null {
  return resolveDedicatedMigrationKey()
}

export async function applyExternalReceivableMigration(): Promise<{
  ok: boolean
  alreadyApplied?: boolean
  error?: string
  sqlApplied?: readonly string[]
}> {
  const dbUrl = resolveDatabaseUrl()
  if (!dbUrl) {
    return { ok: false, error: 'No database URL configured (POSTGRES_URL / DATABASE_URL)' }
  }

  const sql = postgres(dbUrl, { max: 1, prepare: false })
  try {
    const existing = await sql<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'settlements'
        AND column_name = 'option_receivable_usd'
    `
    if (existing.length > 0) {
      return { ok: true, alreadyApplied: true, sqlApplied: MIGRATION_STATEMENTS }
    }

    for (const statement of MIGRATION_STATEMENTS) {
      await sql.unsafe(statement)
    }

    return { ok: true, sqlApplied: MIGRATION_STATEMENTS }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

export async function verifyExternalReceivableColumns(): Promise<{
  ok: boolean
  columns: string[]
  error?: string
}> {
  const dbUrl = resolveDatabaseUrl()
  if (!dbUrl) {
    return { ok: false, columns: [], error: 'No database URL configured' }
  }

  const sql = postgres(dbUrl, { max: 1, prepare: false })
  try {
    const rows = await sql<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'settlements'
        AND column_name IN ('option_receivable_usd', 'tip_transfer_usd', 'option_credit_usd')
      ORDER BY column_name
    `
    const columns = rows.map((r) => r.column_name)
    return {
      ok: columns.includes('option_receivable_usd') && columns.includes('tip_transfer_usd'),
      columns,
    }
  } catch (err) {
    return {
      ok: false,
      columns: [],
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}
