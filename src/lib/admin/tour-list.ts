import type { SettlementStatus } from '@/types'

/** Settlement status labels as shown on the admin tour-management screen. */
export const TOUR_SETTLEMENT_NONE_LABEL = '정산서 미작성'
export const ADMIN_TOUR_EARLY_VIEW_SUBTITLE = '정산서 미작성/작성중 투어'
export const ADMIN_TOUR_ALL_VIEW_SUBTITLE = '전체 투어'

export type TourSettlementStatusLabel =
  | typeof TOUR_SETTLEMENT_NONE_LABEL
  | '작성중'
  | '제출됨'
  | '수정요청'
  | '최종확인'
  | '지급완료'

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
  settlement?: { status: SettlementStatus } | null
}

export function isAdminTourEarlyAssignmentStage(tour: AdminTourSettlementState): boolean {
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
