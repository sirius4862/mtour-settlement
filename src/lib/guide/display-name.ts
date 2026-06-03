/** Guide display name for admin UI — single source of truth. */

import { formatRegionLabel } from '@/lib/region/regions'

export interface GuideNameFields {
  korean_name?: string | null
  vietnamese_name?: string | null
  full_name?: string | null
  email?: string | null
}

export interface GuideHomeBranchFields extends GuideNameFields {
  branch_id?: string | null
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

/** Primary (KO) + optional English/local subtitle for admin lists. */
export function formatGuideDisplayLines(profile: GuideNameFields | null | undefined): {
  primary: string
  secondary: string | null
} {
  if (!profile) return { primary: FALLBACK, secondary: null }
  const ko = nonEmpty(profile.korean_name)
  const en = nonEmpty(profile.vietnamese_name)
  const primary = ko ?? en ?? nonEmpty(profile.full_name) ?? nonEmpty(profile.email) ?? FALLBACK
  let secondary: string | null = null
  if (ko && en && en !== ko) secondary = en
  else if (!ko && en && primary !== en) secondary = null
  else if (ko && !en && nonEmpty(profile.full_name) && profile.full_name !== ko) {
    secondary = profile.full_name!.trim()
  }
  return { primary, secondary }
}

/** Admin assignment label: "홍길동 — DANANG" (home/base branch, not tour region). */
export function formatGuideAssignmentLabel(
  guide: GuideHomeBranchFields,
  homeBranch?: { code: string; name?: string | null } | null,
): string {
  const { primary } = formatGuideDisplayLines(guide)
  const homeLabel = homeBranch
    ? formatRegionLabel(homeBranch.code, homeBranch.name)
    : guide.branch_id
      ? '—'
      : '지역 없음'
  return `${primary} — ${homeLabel}`
}
