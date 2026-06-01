import type { SettlementStatus } from '@/types'
import type { GuideNameFields } from '@/lib/guide/display-name'
import type { SettlementCalcSummaryJson } from '@/lib/settlement/calc-summary'

export const ADMIN_SETTLEMENT_PAGE_SIZE = 25

export const ACTION_NEEDED_STATUSES = [
  'clarification_requested',
  'pending_guide_confirmation',
  'submitted',
] as const satisfies readonly SettlementStatus[]

export type ActionNeededStatus = (typeof ACTION_NEEDED_STATUSES)[number]

/** All statuses shown on admin dashboard cards (global scope — matches action queue). */
export const DASHBOARD_STATUS_ORDER: SettlementStatus[] = [
  'draft',
  'submitted',
  'pending_guide_confirmation',
  'clarification_requested',
  'approved',
  'rejected',
  'edit_requested',
  'paid',
]

export function aggregateSettlementStatusCounts(
  rows: { status: string }[],
  statuses: readonly SettlementStatus[] = DASHBOARD_STATUS_ORDER,
): { status: SettlementStatus; count: number }[] {
  return statuses.map((status) => ({
    status,
    count: rows.filter((r) => r.status === status).length,
  }))
}

export function countActionNeededFromStats(
  stats: { status: SettlementStatus; count: number }[],
): number {
  const actionSet = new Set<string>(ACTION_NEEDED_STATUSES)
  return stats.filter((s) => actionSet.has(s.status)).reduce((sum, s) => sum + s.count, 0)
}

export function countActionNeededFromRows(rows: { status: string }[]): number {
  const actionSet = new Set<string>(ACTION_NEEDED_STATUSES)
  return rows.filter((r) => actionSet.has(r.status)).length
}

const ACTION_STATUS_PRIORITY: Record<ActionNeededStatus, number> = {
  clarification_requested: 0,
  pending_guide_confirmation: 1,
  submitted: 2,
}

export function actionNeededStatusPriority(status: string): number {
  return ACTION_STATUS_PRIORITY[status as ActionNeededStatus] ?? 99
}

export function sortActionNeededSettlements<T extends { status: string; updated_at: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const p = actionNeededStatusPriority(a.status) - actionNeededStatusPriority(b.status)
    if (p !== 0) return p
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })
}

export interface AdminSettlementListItem {
  id: string
  status: SettlementStatus
  year_month: string
  updated_at: string
  submitted_at: string | null
  calc_summary_json: SettlementCalcSummaryJson | Record<string, unknown> | null
  tour: {
    id: string
    pattern: string
    tour_code: string
    start_date: string
    pax_count: number
  } | null
  guide: (GuideNameFields & { id: string; email: string }) | null
}

export interface AdminSettlementsPageResult {
  items: AdminSettlementListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface AdminSettlementListFilters {
  yearMonth?: string
  status?: string
  search?: string
  page?: number
  pageSize?: number
}

export const ADMIN_SETTLEMENT_SELECT = `
  id, status, year_month, updated_at, submitted_at, calc_summary_json,
  tour:tours(id, pattern, tour_code, start_date, pax_count),
  guide:profiles!guide_id(id, full_name, email, korean_name, vietnamese_name)
`

/** Escape user input for PostgREST ilike patterns. */
export function escapeIlikePattern(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}
