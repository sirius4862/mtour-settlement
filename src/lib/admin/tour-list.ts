import type { SettlementStatus, TourAssignmentStatus } from '@/types'
import { isAssignmentRecallEligible } from '@/lib/tour/assignment-recall'

/** Settlement status labels as shown on the admin tour-management screen. */
export const TOUR_SETTLEMENT_NONE_LABEL = '정산서 미작성'
export const TOUR_ASSIGNMENT_RECALLED_LABEL = '배정회수'
export const ADMIN_TOUR_EARLY_VIEW_SUBTITLE = '정산서 미작성/작성중 투어'
export const ADMIN_TOUR_ALL_VIEW_SUBTITLE = '전체 투어'

export type TourSettlementStatusLabel =
  | typeof TOUR_SETTLEMENT_NONE_LABEL
  | '작성중'
  | '제출됨'
  | '수정요청'
  | '최종확인'
  | '지급완료'

export type AdminTourDisplayLabel =
  | TourSettlementStatusLabel
  | typeof TOUR_ASSIGNMENT_RECALLED_LABEL

/**
 * Map a tour's linked settlement status to the tour-screen label.
 * `null`/`undefined` means no settlement row exists yet → 정산서 미작성.
 * Legacy DB statuses are folded into the canonical five-status display.
 */
export function tourSettlementStatusLabel(
  status: SettlementStatus | null | undefined,
): TourSettlementStatusLabel {
  if (!status) return TOUR_SETTLEMENT_NONE_LABEL
  switch (status) {
    case 'draft':
      return '작성중'
    case 'submitted':
      return '제출됨'
    case 'edit_requested':
    case 'rejected':
    case 'clarification_requested':
      return '수정요청'
    case 'pending_guide_confirmation':
    case 'approved':
      return '최종확인'
    case 'paid':
      return '지급완료'
    default:
      return TOUR_SETTLEMENT_NONE_LABEL
  }
}

export type AdminTourListView = 'early' | 'all'

export interface AdminTourSettlementState {
  assignment_status?: TourAssignmentStatus | null
  settlement?: { status: SettlementStatus; guide_confirmed_at?: string | null } | null
}

export function isAdminTourRecalled(tour: AdminTourSettlementState): boolean {
  return tour.assignment_status === 'recalled'
}

/**
 * Tour-screen status label. Recalled assignments show 배정회수 regardless of any
 * residual settlement status; otherwise the linked settlement status is mapped.
 */
export function adminTourDisplayLabel(tour: AdminTourSettlementState): AdminTourDisplayLabel {
  if (isAdminTourRecalled(tour)) return TOUR_ASSIGNMENT_RECALLED_LABEL
  return tourSettlementStatusLabel(tour.settlement?.status)
}

/** Whether the admin may recall (배정회수) this tour's guide assignment. */
export function canRecallAdminTour(tour: AdminTourSettlementState): boolean {
  return isAssignmentRecallEligible({
    assignmentStatus: tour.assignment_status,
    settlementStatus: tour.settlement?.status ?? null,
    guideConfirmedAt: tour.settlement?.guide_confirmed_at ?? null,
  })
}

/**
 * Early assignment stage = pre-settlement work the tour screen owns:
 * 정산서 미작성 or 작성중 (draft). Recalled tours are archived and excluded from
 * the default view so they do not clutter the active assignment list.
 */
export function isAdminTourEarlyAssignmentStage(tour: AdminTourSettlementState): boolean {
  if (isAdminTourRecalled(tour)) return false
  return !tour.settlement || tour.settlement.status === 'draft'
}

export function filterAdminToursForView<T extends SortableTour & AdminTourSettlementState>(
  tours: T[],
  view: AdminTourListView,
): T[] {
  const rows = view === 'all' ? tours : tours.filter(isAdminTourEarlyAssignmentStage)
  return sortAdminToursForList(rows)
}

export interface SortableTour {
  start_date: string
  tour_code: string
  id: string
}

/**
 * Tour-management default order:
 *   tour start_date ascending → tour_code ascending → id ascending.
 * Returns a new array; does not mutate the input.
 */
export function sortAdminToursForList<T extends SortableTour>(tours: T[]): T[] {
  return [...tours].sort((a, b) => {
    const byDate = (a.start_date ?? '').localeCompare(b.start_date ?? '')
    if (byDate !== 0) return byDate
    const byCode = (a.tour_code ?? '').localeCompare(b.tour_code ?? '')
    if (byCode !== 0) return byCode
    return (a.id ?? '').localeCompare(b.id ?? '')
  })
}
