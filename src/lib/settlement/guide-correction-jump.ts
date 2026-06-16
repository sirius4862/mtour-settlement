import type { CorrectionKind, CorrectionSectionId } from '@/lib/settlement/correction-request-meta'

export const GUIDE_CORRECTION_JUMP_EVENT = 'mtour:jump-correction-target'

export type GuideCorrectionJumpDetail = {
  settlementId: string
  section: CorrectionSectionId
  targetIndex: number
  rowId: string | null
  clientId: string | null
  rowLabel: string | null
  kind: CorrectionKind
}

export function correctionHashForSection(section: CorrectionSectionId): string {
  return `correction-${section}`
}

export function parseCorrectionSectionFromHash(hash: string): CorrectionSectionId | null {
  const prefix = '#correction-'
  if (!hash.startsWith(prefix)) return null
  const section = hash.slice(prefix.length)
  const allowed = new Set([
    'basic', 'hotels', 'meals', 'entrances', 'others', 'shopping', 'options',
    'cash', 'tc', 'guide-adjustments', 'adjustments', 'summary',
  ])
  return allowed.has(section) ? (section as CorrectionSectionId) : null
}
