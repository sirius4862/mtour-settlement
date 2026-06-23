/** Supabase project ref for production — never treat as staging. */
export const PRODUCTION_SUPABASE_REF = 'xqkdsgjwftfaacvppxag'

export function extractSupabaseProjectRef(url: string): string | null {
  return url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ?? null
}

export function isProductionSupabaseRef(ref: string | null | undefined): boolean {
  return ref === PRODUCTION_SUPABASE_REF
}

/**
 * Legacy workflow E2E specs still pinned to production DB until true staging exists.
 * Same behavior as the old misnamed STAGING_REF guard.
 */
export function assertLegacyProductionWorkflowSupabase(url: string, label: string): void {
  const ref = extractSupabaseProjectRef(url)
  if (!isProductionSupabaseRef(ref)) {
    throw new Error(
      `${label}: legacy workflow E2E still requires production ref ${PRODUCTION_SUPABASE_REF} until true staging is configured. Got ref=${ref ?? 'missing'}.`,
    )
  }
}

/** Staging-only E2E / probes — refuse production. */
export function assertStagingSupabaseNotProduction(url: string, label: string): void {
  const ref = extractSupabaseProjectRef(url)
  if (!ref) {
    throw new Error(`${label}: NEXT_PUBLIC_SUPABASE_URL missing or unparsed.`)
  }
  if (isProductionSupabaseRef(ref)) {
    throw new Error(
      `${label}: refusing production ref ${PRODUCTION_SUPABASE_REF}. Use .env.staging with a non-production project.`,
    )
  }
}
