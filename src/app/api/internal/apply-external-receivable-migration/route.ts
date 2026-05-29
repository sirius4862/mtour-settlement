import {
  applyExternalReceivableMigration,
  resolveMigrationAuthKey,
  verifyExternalReceivableColumns,
} from '@/lib/supabase/apply-external-receivable-migration'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function unauthorized() {
  return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}

function checkAuth(request: Request): boolean {
  const provided =
    request.headers.get('x-migration-key') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''

  const expected =
    resolveMigrationAuthKey() ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null
  if (!expected) return false
  return provided === expected
}

export async function POST(request: Request) {
  if (!checkAuth(request)) return unauthorized()

  const result = await applyExternalReceivableMigration()
  const verify = result.ok ? await verifyExternalReceivableColumns() : null

  return Response.json({
    ...result,
    verify,
  })
}

export async function GET(request: Request) {
  if (!checkAuth(request)) return unauthorized()

  const verify = await verifyExternalReceivableColumns()
  return Response.json({ verify })
}
