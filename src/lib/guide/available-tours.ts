import type { Tour } from '@/types'

/** Fields for guide new/edit form and settlement create binding. */
export const GUIDE_AVAILABLE_TOUR_SELECT =
  'id,tour_code,pattern,agency_name,start_date,end_date,pax_count,vehicle_type,tc_name,guide_id,branch_id,assignment_status'

/** Fields rendered on /guide assigned-tour cards only. */
export const GUIDE_DASHBOARD_AVAILABLE_TOUR_SELECT =
  'id,tour_code,pattern,agency_name,start_date,end_date,pax_count'

export type GuideDashboardAvailableTour = Pick<
  Tour,
  'id' | 'tour_code' | 'pattern' | 'agency_name' | 'start_date' | 'end_date' | 'pax_count'
>

export function guideDashboardTourLabel(
  tour: Pick<Tour, 'tour_code' | 'pattern' | 'start_date' | 'end_date'>,
): string {
  return `[${tour.tour_code}] ${tour.pattern} — ${tour.start_date}~${tour.end_date}`
}

/** Build a set of tour ids that already have a settlement row for this guide. */
export function collectUsedTourIds(
  rows: Array<{ tour_id?: string | null }> | null | undefined,
): Set<string> {
  const used = new Set<string>()
  for (const row of rows ?? []) {
    const tourId = row?.tour_id
    if (tourId) used.add(tourId)
  }
  return used
}

/**
 * Exclude tours that already have settlements. Preserves input order.
 * Safe when usedTourIds is empty or settlement rows omit tour_id.
 */
export function filterToursWithoutSettlements<T extends { id: string }>(
  tours: readonly T[],
  usedTourIds: ReadonlySet<string> | readonly string[],
): T[] {
  const used = usedTourIds instanceof Set ? usedTourIds : new Set(usedTourIds)
  if (used.size === 0) return [...tours]
  return tours.filter((tour) => !used.has(tour.id))
}
