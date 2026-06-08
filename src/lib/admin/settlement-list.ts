import { recentWeekRange } from '@/lib/admin/date-range-filter'
import type { SettlementStatus } from '@/types'
import type { GuideNameFields } from '@/lib/guide/display-name'
import type { SettlementCalcSummaryJson } from '@/lib/settlement/calc-summary'
import { WORKFLOW_STATUS_ORDER } from '@/lib/settlement/status-display'

export const ADMIN_SETTLEMENT_PAGE_SIZE = 25

export const ADMIN_SETTLEMENT_EMPTY_STATUS_MESSAGE =
  '상태 카드를 선택하면 해당 정산서가 표시됩니다.'

export const ADMIN_SETTLEMENT_NO_STATUS_SUBTITLE = '상태 미선택'

export const ADMIN_SETTLEMENT_DATE_RANGE_MAX_ERROR =
  '조회 기간은 최대 1년까지 선택할 수 있습니다.'

export const ADMIN_SETTLEMENT_DATE_ORDER_ERROR =
  '시작일은 종료일보다 늦을 수 없습니다.'

export const ADMIN_DASHBOARD_PROGRESS_ALL_LABEL = '진행 전체 보기'

export const ADMIN_DASHBOARD_PAID_HISTORY_LABEL = '지급완료 내역'

export const ADMIN_DASHBOARD_STATUS_ORDER: SettlementStatus[] = [
  'draft',
  'submitted',
  'edit_requested',
  'pending_guide_confirmation',
]

export type AdminSettlementListMode = 'none' | 'status' | 'all'

export function resolveAdminSettlementListMode(params: {
  status?: string
  view?: string
}): AdminSettlementListMode {
  if (params.status) return 'status'
  if (params.view === 'all') return 'all'
  return 'none'
}

export function shouldFetchAdminSettlementRows(params: {
  status?: string
  view?: string
}): boolean {
  return resolveAdminSettlementListMode(params) !== 'none'
}

export function buildAdminSettlementListSubtitle(params: {
  regionLabel: string
  statusLabel?: string
  view?: string
}): string {
  if (params.statusLabel) return `${params.regionLabel} · ${params.statusLabel}`
  if (params.view === 'all') return `${params.regionLabel} · 전체 보기`
  return ADMIN_SETTLEMENT_NO_STATUS_SUBTITLE
}

export function buildAdminSettlementSearchSubtitle(params: {
  startDate: string
  endDate: string
  regionLabel: string
  statusLabel: string
  search?: string
}): string {
  const parts = [
    `${params.startDate} ~ ${params.endDate}`,
    params.regionLabel,
    params.statusLabel,
  ]
  const search = params.search?.trim()
  if (search) parts.push(`검색: ${search}`)
  return parts.join(' · ')
}

export function buildAdminDashboardListSubtitle(params: {
  regionLabel: string
  statusLabel?: string
  view?: string
}): string {
  if (params.statusLabel) return `${params.regionLabel} · ${params.statusLabel}`
  if (params.view === 'all') return `${params.regionLabel} · ${ADMIN_DASHBOARD_PROGRESS_ALL_LABEL}`
  return `${params.regionLabel} · ${ADMIN_SETTLEMENT_NO_STATUS_SUBTITLE}`
}

export function isAdminDashboardProgressStatus(status: string): boolean {
  return ADMIN_DASHBOARD_STATUS_ORDER.includes(normalizeStatusForDashboard(status))
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function defaultAdminSettlementDateRange(now = new Date()): {
  startDate: string
  endDate: string
} {
  return recentWeekRange(now)
}

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }
  return parsed
}

export function validateAdminSettlementDateRange(params: {
  startDate: string
  endDate: string
}): { ok: true } | { ok: false; message: string } {
  const start = parseDateOnly(params.startDate)
  const end = parseDateOnly(params.endDate)
  if (!start || !end) return { ok: false, message: '조회 시작일과 종료일을 선택해 주세요.' }
  if (start.getTime() > end.getTime()) {
    return { ok: false, message: ADMIN_SETTLEMENT_DATE_ORDER_ERROR }
  }

  const maxExclusiveEnd = new Date(start)
  maxExclusiveEnd.setUTCFullYear(maxExclusiveEnd.getUTCFullYear() + 1)
  if (end.getTime() >= maxExclusiveEnd.getTime()) {
    return { ok: false, message: ADMIN_SETTLEMENT_DATE_RANGE_MAX_ERROR }
  }

  return { ok: true }
}

/** Admin action queue — includes legacy DB statuses until migrated. */
export const ACTION_NEEDED_STATUSES = [
  'submitted',
  'clarification_requested',
  'pending_guide_confirmation',
  'approved',
] as const satisfies readonly SettlementStatus[]

export type ActionNeededStatus = (typeof ACTION_NEEDED_STATUSES)[number]

/** Five workflow statuses available to the full admin list. */
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

export function sortAdminSettlementsByTourDate<
  T extends {
    id: string
    tour: { start_date: string | null; tour_code: string | null } | null
  },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const dateA = a.tour?.start_date ?? ''
    const dateB = b.tour?.start_date ?? ''
    const dateCompare = dateA.localeCompare(dateB)
    if (dateCompare !== 0) return dateCompare

    const codeA = a.tour?.tour_code ?? ''
    const codeB = b.tour?.tour_code ?? ''
    const codeCompare = codeA.localeCompare(codeB)
    if (codeCompare !== 0) return codeCompare

    return a.id.localeCompare(b.id)
  })
}

export type AdminSettlementFilterableRow = {
  id: string
  status: string
  branch_id?: string | null
  tour: { start_date: string | null; tour_code: string | null; pattern?: string | null } | null
  guide?: (GuideNameFields & { email?: string | null }) | null
}

export function matchesAdminSettlementSearch(
  row: AdminSettlementFilterableRow,
  search: string,
): boolean {
  const term = search.trim().toLowerCase()
  if (!term) return true
  return [
    row.tour?.pattern,
    row.tour?.tour_code,
    row.guide?.full_name,
    row.guide?.email,
    row.guide?.korean_name,
    row.guide?.vietnamese_name,
  ].some((value) => value?.toLowerCase().includes(term))
}

export function filterAdminSettlementRowsForList<T extends AdminSettlementFilterableRow>(
  rows: T[],
  filters: {
    startDate: string
    endDate: string
    status?: string
    regionId?: string
    search?: string
  },
): T[] {
  const statuses = filters.status ? new Set(expandWorkflowStatusFilter(filters.status)) : null
  return sortAdminSettlementsByTourDate(
    rows.filter((row) => {
      const tourDate = row.tour?.start_date
      if (!tourDate || tourDate < filters.startDate || tourDate > filters.endDate) return false
      if (filters.regionId && row.branch_id !== filters.regionId) return false
      if (statuses && !statuses.has(row.status as SettlementStatus)) return false
      return matchesAdminSettlementSearch(row, filters.search ?? '')
    }),
  )
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
  startDate?: string
  endDate?: string
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
