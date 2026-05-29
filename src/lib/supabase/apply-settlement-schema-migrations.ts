import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATION_FILES = [
  'other_expense_flat_migration.sql',
  'company_expense_items_migration.sql',
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

export function resolveMigrationAuthKey(): string | null {
  return process.env.MIGRATION_RUN_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null
}

function readMigrationSql(filename: (typeof MIGRATION_FILES)[number]): string {
  return readFileSync(join(process.cwd(), 'supabase', filename), 'utf8')
}

export async function applySettlementSchemaMigrations(): Promise<{
  ok: boolean
  alreadyApplied?: boolean
  error?: string
  applied?: string[]
}> {
  const dbUrl = resolveDatabaseUrl()
  if (!dbUrl) {
    return { ok: false, error: 'No database URL configured (POSTGRES_URL / DATABASE_URL)' }
  }

  const sql = postgres(dbUrl, { max: 1, prepare: false })
  try {
    const verify = await verifySettlementSchemaMigrations(sql)
    if (verify.ok) {
      return { ok: true, alreadyApplied: true, applied: [...MIGRATION_FILES] }
    }

    const applied: string[] = []
    for (const file of MIGRATION_FILES) {
      await sql.unsafe(readMigrationSql(file))
      applied.push(file)
    }

    const after = await verifySettlementSchemaMigrations(sql)
    if (!after.ok) {
      return { ok: false, error: after.error ?? 'Verification failed after migration' }
    }

    return { ok: true, applied }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function verifySettlementSchemaMigrations(
  sql: ReturnType<typeof postgres>,
): Promise<{ ok: boolean; error?: string; details?: Record<string, unknown> }> {
  const otherCols = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'other_expense_items'
      AND column_name IN ('note', 'entry_mode')
    ORDER BY column_name
  `
  const otherNames = otherCols.map((r) => r.column_name)

  const companyTable = await sql<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'company_expense_items'
  `

  let companyColumns: string[] = []
  if (companyTable.length > 0) {
    const cols = await sql<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'company_expense_items'
      ORDER BY ordinal_position
    `
    companyColumns = cols.map((c) => c.column_name)
  }

  const requiredCompany = [
    'id',
    'settlement_id',
    'description',
    'amount_usd',
    'amount_vnd',
    'note',
    'sort_order',
    'created_at',
    'updated_at',
  ]

  const otherOk = otherNames.includes('note') && otherNames.includes('entry_mode')
  const companyOk =
    companyTable.length > 0 && requiredCompany.every((c) => companyColumns.includes(c))

  if (otherOk && companyOk) {
    return {
      ok: true,
      details: { other_expense_items: otherNames, company_expense_items: companyColumns },
    }
  }

  return {
    ok: false,
    error: 'Schema verification failed',
    details: {
      other_expense_items: otherNames,
      company_expense_items_exists: companyTable.length > 0,
      company_expense_items: companyColumns,
    },
  }
}

export async function verifySettlementSchemaMigrationState(): Promise<{
  ok: boolean
  error?: string
  details?: Record<string, unknown>
}> {
  const dbUrl = resolveDatabaseUrl()
  if (!dbUrl) {
    return { ok: false, error: 'No database URL configured', details: {} }
  }

  const sql = postgres(dbUrl, { max: 1, prepare: false })
  try {
    return await verifySettlementSchemaMigrations(sql)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}
