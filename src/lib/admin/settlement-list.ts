import type { SettlementStatus } from '@/types'
import type { GuideNameFields } from '@/lib/guide/display-name'
import type { SettlementCalcSummaryJson } from '@/lib/settlement/calc-summary'
import { WORKFLOW_STATUS_ORDER } from '@/lib/settlement/status-display'

export const ADMIN_SETTLEMENT_PAGE_SIZE = 25

/** Admin action queue — includes legacy DB statuses until migrated. */
export const ACTION_NEEDED_STATUSES = [
  'submitted',
  'clarification_requested',
  'pending_guide_confirmation',
  'approved',
] as const satisfies readonly SettlementStatus[]

export type ActionNeededStatus = (typeof ACTION_NEEDED_STATUSES)[number]

/** Five workflow statuses on admin dashboard cards. */
export const DASHBOARD_STATUS_ORDER: SettlementStatus[] = [...WORKFLOW_STATUS_ORDER]

export function aggregateSettlementStatusCounts(
  rows: { status: string }[],
  statuses: readonly SettlementStatus[] = DASHBOARD_STATUS_ORDER,
): { status: SettlementStatus; count: number }[] {
  const normalized = rows.map((r) => normalizeStatusForDashboard(r.status))
  return statuses.map((status) => ({
    status,
    count: normalized.filter((s) => s === status).length,
  }))
}

/** Map legacy DB statuses into the five-status dashboard model. */
export function normalizeStatusForDashboard(status: string): SettlementStatus {
  switch (status) {
    case 'clarification_requested':
      return 'edit_requested'
    case 'rejected':
      return 'edit_requested'
    case 'approved':
      return 'pending_guide_confirmation'
    default:
      return status as SettlementStatus
  }
}

/**
 * Expand workflow filter to include legacy DB statuses (pre-migration only).
 * @see WORKFLOW_STATUS_FILTER_EXPANSION
 */
export function expandWorkflowStatusFilter(filter: string): SettlementStatus[] {
  const expanded = WORKFLOW_STATUS_FILTER_EXPANSION[filter as WorkflowFilterStatus]
  if (expanded) return [...expanded]
  return [filter as SettlementStatus]
}

/** Pre-migration: workflow UI filter → raw DB statuses for list queries. */
export const WORKFLOW_STATUS_FILTER_EXPANSION = {
  draft: ['draft'],
  submitted: ['submitted'],
  edit_requested: ['edit_requested', 'rejected', 'clarification_requested'],
  pending_guide_confirmation: ['pending_guide_confirmation', 'approved'],
  paid: ['paid'],
} as const

export type WorkflowFilterStatus = keyof typeof WORKFLOW_STATUS_FILTER_EXPANSION

export function countActionNeededFromStats(
  stats: { status: SettlementStatus; count: number }[],
): number {
  const actionWorkflowStatuses = new Set<SettlementStatus>(['submitted', 'pending_guide_confirmation'])
  return stats
    .filter((s) => actionWorkflowStatuses.has(s.status))
    .reduce((sum, s) => sum + s.count, 0)
}

export function countActionNeededFromRows(rows: { status: string }[]): number {
  const actionWorkflowStatuses = new Set<SettlementStatus>(['submitted', 'pending_guide_confirmation'])
  return rows.filter((r) => actionWorkflowStatuses.has(normalizeStatusForDashboard(r.status))).length
}

const ACTION_STATUS_PRIORITY: Record<string, number> = {
  submitted: 0,
  clarification_requested: 0,
  pending_guide_confirmation: 1,
  approved: 1,
}

export function actionNeededStatusPriority(status: string): number {
  return ACTION_STATUS_PRIORITY[status] ?? 99
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
  guide_confirmed_at: string | null
  branch_id: string
  calc_summary_json: SettlementCalcSummaryJson | Record<string, unknown> | null
  tour: {
    id: string
    pattern: string
    tour_code: string
    start_date: string
    pax_count: number
  } | null
  guide: (GuideNameFields & { id: string; email: string }) | null
  branch: { id: string; name: string; code: string } | null
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
  /** Region filter — `settlements.branch_id`. Master admin only; plain admin uses assigned region. */
  regionId?: string
  page?: number
  pageSize?: number
}

export const ADMIN_SETTLEMENT_SELECT = `
  id, status, year_month, updated_at, submitted_at, guide_confirmed_at, branch_id, calc_summary_json,
  tour:tours(id, pattern, tour_code, start_date, pax_count),
  guide:profiles!guide_id(id, full_name, email, korean_name, vietnamese_name, branch_id),
  branch:branches(id, name, code)
`

/** Escape user input for PostgREST ilike patterns. */
export function escapeIlikePattern(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}
