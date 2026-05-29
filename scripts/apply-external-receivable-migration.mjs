import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sqlPath = join(process.cwd(), 'supabase', 'external_receivable_migration.sql')
const migrationSql = readFileSync(sqlPath, 'utf8')

const dbUrl =
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL ??
  process.env.SUPABASE_DB_URL

if (!dbUrl) {
  console.error('Missing POSTGRES_URL / DATABASE_URL / SUPABASE_DB_URL')
  process.exit(1)
}

const sql = postgres(dbUrl, { max: 1, prepare: false })

try {
  await sql.unsafe(migrationSql)
  const columns = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'settlements'
      AND column_name IN ('option_receivable_usd', 'tip_transfer_usd', 'option_credit_usd')
    ORDER BY column_name
  `
  console.log('Migration applied successfully.')
  console.log('Columns:', columns.map((c) => c.column_name).join(', '))
} catch (err) {
  console.error(err)
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
