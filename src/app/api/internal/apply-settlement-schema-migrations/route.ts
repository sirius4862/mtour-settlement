import {
  applySettlementSchemaMigrations,
  verifySettlementSchemaMigrationState,
} from '@/lib/supabase/apply-settlement-schema-migrations'
import {
  checkMigrationRequestAuth,
  migrationRoutesEnabled,
} from '@/lib/internal/migration-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function notFound() {
  return Response.json({ ok: false, error: 'Not found' }, { status: 404 })
}

function unauthorized() {
  return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}

function guard(request: Request): Response | null {
  if (!migrationRoutesEnabled()) return notFound()
  if (!checkMigrationRequestAuth(request)) return unauthorized()
  return null
}

export async function POST(request: Request) {
  const blocked = guard(request)
  if (blocked) return blocked

  const result = await applySettlementSchemaMigrations()
  const verify = result.ok ? await verifySettlementSchemaMigrationState() : null

  return Response.json({
    ...result,
    verify,
  })
}

export async function GET(request: Request) {
  const blocked = guard(request)
  if (blocked) return blocked

  const verify = await verifySettlementSchemaMigrationState()
  return Response.json({ verify })
}
