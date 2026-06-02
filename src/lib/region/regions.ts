/** MTour operating regions — v1 uses `branches` rows keyed by `code`. */
export const MTOUR_REGION_CODES = [
  'HANOI',
  'DANANG',
  'NHATRANG',
  'HCM',
  'PHUQUOC',
] as const

export type MtourRegionCode = (typeof MTOUR_REGION_CODES)[number]

export const MTOUR_REGION_LABELS: Record<MtourRegionCode, string> = {
  HANOI: 'Hanoi',
  DANANG: 'Da Nang',
  NHATRANG: 'Nha Trang',
  HCM: 'Ho Chi Minh',
  PHUQUOC: 'Phu Quoc',
}

export function isMtourRegionCode(code: string): code is MtourRegionCode {
  return (MTOUR_REGION_CODES as readonly string[]).includes(code)
}

export function formatRegionLabel(code: string | null | undefined, fallbackName?: string | null): string {
  if (code && isMtourRegionCode(code)) return MTOUR_REGION_LABELS[code]
  if (fallbackName?.trim()) return fallbackName.trim()
  return '—'
}

export function sortBranchesByRegionOrder<T extends { code: string }>(rows: T[]): T[] {
  const order = new Map(MTOUR_REGION_CODES.map((c, i) => [c, i]))
  return [...rows].sort((a, b) => {
    const ai = order.get(a.code as MtourRegionCode) ?? 999
    const bi = order.get(b.code as MtourRegionCode) ?? 999
    if (ai !== bi) return ai - bi
    return a.code.localeCompare(b.code)
  })
}

export function filterMtourRegionBranches<T extends { code: string }>(rows: T[]): T[] {
  return sortBranchesByRegionOrder(rows.filter((b) => isMtourRegionCode(b.code)))
}
