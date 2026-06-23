/** Shared Supabase project ref constants — no secrets. */
export const PRODUCTION_SUPABASE_REF = 'xqkdsgjwftfaacvppxag'

export function extractSupabaseProjectRef(url) {
  return url?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ?? null
}

export function isProductionSupabaseRef(ref) {
  return ref === PRODUCTION_SUPABASE_REF
}

export function refuseProductionDbUrl(dbUrl, label) {
  const ref = extractSupabaseProjectRef(dbUrl) ?? (dbUrl.includes(PRODUCTION_SUPABASE_REF) ? PRODUCTION_SUPABASE_REF : null)
  if (isProductionSupabaseRef(ref) || dbUrl.includes(PRODUCTION_SUPABASE_REF)) {
    return {
      ok: false,
      error: `${label}: refusing production ref ${PRODUCTION_SUPABASE_REF}. Use a true staging project DATABASE_URL.`,
    }
  }
  if (!ref && !dbUrl) {
    return { ok: false, error: `${label}: DATABASE_URL / POSTGRES_URL missing.` }
  }
  return { ok: true, ref }
}
