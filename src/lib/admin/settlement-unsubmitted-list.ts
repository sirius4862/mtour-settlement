import {
  expandWorkflowStatusFilter,
  matchesAdminSettlementSearch,
  sortAdminSettlementsByTourDate,
  type AdminSettlementListItem,
} from '@/lib/admin/settlement-list'
import type { SettlementStatus } from '@/types'

/** Synthetic list id prefix — no settlement row exists for these tours. */
export const ADMIN_UNSUBMITTED_TOUR_ITEM_ID_PREFIX = 'tour-unsubmitted:'

export const ADMIN_UNSUBMITTED_SETTLEMENT_COUNT_SELECT = 'status, tour_id'

export const ADMIN_UNSUBMITTED_TOUR_SELECT = `
  id, pattern, tour_code, start_date, pax_count, branch_id, guide_id, assignment_status, created_at,
  guide:profiles!guide_id(id, full_name, email, korean_name, vietnamese_name, branch_id),
  branch:branches!branch_id(id, name, code)
`

export type AdminUnsubmittedTourRow = {
  id: string
  pattern: string | null
  tour_code: string | null
  start_date: string | null
  pax_count: number | null
  branch_id: string
  guide_id: string | null
  assignment_status: string | null
  created_at: string | null
  guide: AdminSettlementListItem['guide']
  branch: AdminSettlementListItem['branch']
}

/** True when the admin list status filter is 미제출 only (`draft`). */
export function isAdminUnsubmittedOnlyStatusFilter(status?: string): boolean {
  if (!status) return false
  const expanded = expandWorkflowStatusFilter(status)
  return expanded.length === 1 && expanded[0] === 'draft'
}

export function isAdminUnsubmittedTourListItemId(id: string): boolean {
  return id.startsWith(ADMIN_UNSUBMITTED_TOUR_ITEM_ID_PREFIX)
}

/** 미제출 list rows: no settlement yet, or an existing draft settlement. */
export function settlementStatusAllowsUnsubmittedList(
  status: SettlementStatus | null | undefined,
): boolean {
  return status == null || status === 'draft'
}

export function buildAdminUnsubmittedTourListItem(
  tour: AdminUnsubmittedTourRow,
): AdminSettlementListItem {
  const startDate = tour.start_date ?? ''
  const updatedAt = tour.created_at ?? (startDate ? `${startDate}T00:00:00.000Z` : '1970-01-01T00:00:00.000Z')
  return {
    id: `${ADMIN_UNSUBMITTED_TOUR_ITEM_ID_PREFIX}${tour.id}`,
    status: 'draft',
    year_month: startDate.slice(0, 7),
    updated_at: updatedAt,
    submitted_at: null,
    guide_confirmed_at: null,
    branch_id: tour.branch_id,
    calc_summary_json: null,
    tour: tour.start_date
      ? {
          id: tour.id,
          pattern: tour.pattern ?? '',
          tour_code: tour.tour_code ?? '',
          start_date: tour.start_date,
          pax_count: tour.pax_count ?? 0,
        }
      : null,
    guide: tour.guide,
    branch: tour.branch,
  }
}

/**
 * Merge assigned tours (no settlement or draft only) with draft settlement rows.
 * Does not create settlement records.
 */
export function mergeAdminUnsubmittedListItems(
  tours: AdminUnsubmittedTourRow[],
  settlements: AdminSettlementListItem[],
  search?: string,
): AdminSettlementListItem[] {
  const settlementByTourId = new Map<string, AdminSettlementListItem>()
  for (const row of settlements) {
    const tourId = row.tour?.id
    if (tourId) settlementByTourId.set(tourId, row)
  }

  const items: AdminSettlementListItem[] = []
  for (const tour of tours) {
    const linked = settlementByTourId.get(tour.id)
    if (linked) {
      if (linked.status === 'draft') items.push(linked)
      continue
    }
    items.push(buildAdminUnsubmittedTourListItem(tour))
  }

  const term = search?.trim()
  const filtered = term
    ? items.filter((row) => matchesAdminSettlementSearch(row, term))
    : items

  return sortAdminSettlementsByTourDate(filtered)
}

/** Minimal settlement shape for unsubmitted count (no search). */
export type AdminUnsubmittedCountSettlementRow = {
  status: string
  tour?: { id: string } | null
}

/**
 * Count 미제출 backlog rows using the same rules as mergeAdminUnsubmittedListItems.
 * When search is set, delegates to merge for exact parity with list/search behavior.
 */
export function computeAdminUnsubmittedTotal(
  tours: AdminUnsubmittedTourRow[],
  settlements: AdminSettlementListItem[],
  search?: string,
): number {
  return mergeAdminUnsubmittedListItems(tours, settlements, search).length
}

/**
 * Fast count path when search is absent — mirrors merge dedup without sorting.
 */
export function countAdminUnsubmittedWithoutSearch(
  tours: AdminUnsubmittedTourRow[],
  settlements: AdminUnsubmittedCountSettlementRow[],
): number {
  const settlementByTourId = new Map<string, AdminUnsubmittedCountSettlementRow>()
  for (const row of settlements) {
    const tourId = row.tour?.id
    if (tourId) settlementByTourId.set(tourId, row)
  }

  let count = 0
  for (const tour of tours) {
    const linked = settlementByTourId.get(tour.id)
    if (linked) {
      if (linked.status === 'draft') count += 1
      continue
    }
    count += 1
  }
  return count
}

export function computeAdminUnsubmittedTotalFromRows(
  tours: AdminUnsubmittedTourRow[],
  settlements: AdminUnsubmittedCountSettlementRow[],
  search?: string,
): number {
  if (search?.trim()) {
    return computeAdminUnsubmittedTotal(
      tours,
      settlements as unknown as AdminSettlementListItem[],
      search,
    )
  }
  return countAdminUnsubmittedWithoutSearch(tours, settlements)
}
