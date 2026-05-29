import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dbUrl =
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL ??
  process.env.SUPABASE_DB_URL

if (!dbUrl) {
  console.error('Missing POSTGRES_URL / DATABASE_URL / SUPABASE_DB_URL')
  process.exit(1)
}

const migrations = [
  'other_expense_flat_migration.sql',
  'company_expense_items_migration.sql',
]

const sql = postgres(dbUrl, { max: 1, prepare: false })

async function verifyOtherExpenseColumns() {
  const rows = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'other_expense_items'
      AND column_name IN ('note', 'entry_mode')
    ORDER BY column_name
  `
  return rows.map((r) => r.column_name)
}

async function verifyCompanyExpenseTable() {
  const table = await sql<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'company_expense_items'
  `
  if (table.length === 0) return { exists: false, columns: [] as string[] }

  const columns = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'company_expense_items'
    ORDER BY ordinal_position
  `
  return { exists: true, columns: columns.map((c) => c.column_name) }
}

try {
  for (const file of migrations) {
    const path = join(process.cwd(), 'supabase', file)
    const migrationSql = readFileSync(path, 'utf8')
    console.log(`Applying ${file}...`)
    await sql.unsafe(migrationSql)
    console.log(`Applied ${file}`)
  }

  const otherCols = await verifyOtherExpenseColumns()
  const company = await verifyCompanyExpenseTable()

  console.log('\nVerification:')
  console.log('other_expense_items columns:', otherCols.join(', ') || '(none)')
  console.log('company_expense_items exists:', company.exists)
  console.log('company_expense_items columns:', company.columns.join(', ') || '(none)')

  const otherOk = otherCols.includes('note') && otherCols.includes('entry_mode')
  const companyRequired = [
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
  const companyOk =
    company.exists && companyRequired.every((col) => company.columns.includes(col))

  if (!otherOk || !companyOk) {
    console.error('\nVerification FAILED')
    process.exit(1)
  }

  console.log('\nAll migrations verified successfully.')
} catch (err) {
  console.error(err)
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
