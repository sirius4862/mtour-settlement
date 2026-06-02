import type { Profile } from '@/types'

/** Korean display name for admin UI (`profiles.korean_name`). */
export type ProfileDisplayNameKo = Profile['korean_name']

/** English/local display name (`profiles.vietnamese_name` in v1). */
export type ProfileDisplayNameEn = Profile['vietnamese_name']

export function profileDisplayNameKo(
  profile: Pick<Profile, 'korean_name'> | null | undefined,
): string | null {
  const v = profile?.korean_name?.trim()
  return v ? v : null
}

export function profileDisplayNameEn(
  profile: Pick<Profile, 'vietnamese_name'> | null | undefined,
): string | null {
  const v = profile?.vietnamese_name?.trim()
  return v ? v : null
}

/** Assigned region id — guides require; admins use as primary region in v1. */
export function profileAssignedRegionId(
  profile: Pick<Profile, 'branch_id'> | null | undefined,
): string | null {
  return profile?.branch_id ?? null
}
