/** Guide display name for admin UI — single source of truth. */

export interface GuideNameFields {
  korean_name?: string | null
  vietnamese_name?: string | null
  full_name?: string | null
  email?: string | null
}

const FALLBACK = '이름 없음'

function nonEmpty(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** korean → vietnamese → full_name → email → "이름 없음" */
export function formatGuideDisplayName(profile: GuideNameFields | null | undefined): string {
  if (!profile) return FALLBACK
  return (
    nonEmpty(profile.korean_name) ??
    nonEmpty(profile.vietnamese_name) ??
    nonEmpty(profile.full_name) ??
    nonEmpty(profile.email) ??
    FALLBACK
  )
}
