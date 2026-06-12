import type { SettlementStatus, SettlementWithTour } from '@/types'

/** 최근 정산서 섹션에 표시하는 건수 — 기존 `slice(0, 3)` 동작과 동일. */
export const GUIDE_DASHBOARD_RECENT_LIMIT = 3

/** 작성중·수정 필요·최종 확인 작업 큐 섹션 상한 (전체 이력 미로드). */
export const GUIDE_DASHBOARD_QUEUE_LIMIT = 5

/** 작성중 섹션 — draft만 (기존 page 필터와 동일). */
export const GUIDE_DASHBOARD_DRAFT_STATUSES = ['draft'] as const satisfies readonly SettlementStatus[]

/** 수정 필요 섹션 — edit_requested만 (rejected/clarification_requested 미포함). */
export const GUIDE_DASHBOARD_EDIT_REQUESTED_STATUSES = ['edit_requested'] as const satisfies readonly SettlementStatus[]

/** 최종 확인 필요 섹션 — pending_guide_confirmation + 미확인. */
export const GUIDE_DASHBOARD_PENDING_CONFIRMATION_STATUS: SettlementStatus = 'pending_guide_confirmation'

/** 가이드 대시보드 정산 카드에 필요한 최소 컬럼 (calc_summary_json 제외). */
export const GUIDE_DASHBOARD_SETTLEMENT_SELECT =
  'id,tour_id,guide_id,branch_id,status,reject_reason,guide_confirmed_at,created_at,updated_at,tour:tours(id,tour_code,pattern,start_date,end_date)'

export interface GuideDashboardSettlements {
  draft: SettlementWithTour[]
  editRequested: SettlementWithTour[]
  pendingConfirmation: SettlementWithTour[]
  recent: SettlementWithTour[]
}

export const EMPTY_GUIDE_DASHBOARD_SETTLEMENTS: GuideDashboardSettlements = {
  draft: [],
  editRequested: [],
  pendingConfirmation: [],
  recent: [],
}

export function isGuideDashboardPendingConfirmation(row: {
  status: SettlementStatus | string
  guide_confirmed_at: string | null | undefined
}): boolean {
  return row.status === GUIDE_DASHBOARD_PENDING_CONFIRMATION_STATUS && row.guide_confirmed_at == null
}

/**
 * Legacy in-memory grouping — mirrors the pre-optimization dashboard behavior
 * when fed a full `created_at` desc settlement list.
 */
export function groupSettlementsForGuideDashboard(
  rows: SettlementWithTour[],
): GuideDashboardSettlements {
  const sorted = [...rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
  return {
    draft: sorted.filter((s) => s.status === 'draft'),
    editRequested: sorted.filter((s) => s.status === 'edit_requested'),
    pendingConfirmation: sorted.filter(isGuideDashboardPendingConfirmation),
    recent: sorted.slice(0, GUIDE_DASHBOARD_RECENT_LIMIT),
  }
}
