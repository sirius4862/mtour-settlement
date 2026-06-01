/** Auth for one-off internal migration HTTP routes — MIGRATION_RUN_KEY only. */
export function resolveMigrationAuthKey(): string | null {
  const key = process.env.MIGRATION_RUN_KEY?.trim()
  return key || null
}

export function checkMigrationRequestAuth(request: Request): boolean {
  const expected = resolveMigrationAuthKey()
  if (!expected) return false

  const provided =
    request.headers.get('x-migration-key') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''

  return provided === expected
}

export function migrationRoutesEnabled(): boolean {
  return resolveMigrationAuthKey() !== null
}
