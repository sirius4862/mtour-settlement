import type { SettlementStatus, SettlementWithTour } from '@/types'
import { expandWorkflowStatusFilter } from '@/lib/admin/settlement-list'
import { isWorkflowStatus } from '@/lib/settlement/status-display'

export const GUIDE_SETTLEMENT_HISTORY_PAGE_SIZE = 20

export const GUIDE_HISTORY_PERIODS = ['30d', '90d', '1y', 'all'] as const
export type GuideHistoryPeriod = (typeof GUIDE_HISTORY_PERIODS)[number]
export const GUIDE_HISTORY_STATUS_ORDER: SettlementStatus[] = [
  'draft',
  'submitted',
  'edit_requested',
  'pending_guide_confirmation',
  'paid',
]

export interface GuideSettlementHistoryFilters {
  status?: string
  period?: string
  search?: string
  page?: number
  pageSize?: number
}

export interface GuideSettlementHistoryResult {
  items: SettlementWithTour[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export function parseGuideHistoryStatus(value?: string | null): SettlementStatus | '' {
  return value && isWorkflowStatus(value as SettlementStatus)
    ? (value as SettlementStatus)
    : ''
}

export function parseGuideHistoryPeriod(value?: string | null): GuideHistoryPeriod {
  return GUIDE_HISTORY_PERIODS.includes(value as GuideHistoryPeriod)
    ? (value as GuideHistoryPeriod)
    : 'all'
}

export function normalizeGuideHistoryPage(value?: number | string | null): number {
  const page = typeof value === 'number' ? value : parseInt(value || '1', 10)
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

export function guideHistorySinceDate(period: GuideHistoryPeriod, now = new Date()): string | null {
  const days =
    period === '30d' ? 30 :
    period === '90d' ? 90 :
    period === '1y' ? 365 :
    null
  if (days == null) return null
  const since = new Date(now)
  since.setDate(since.getDate() - days)
  return since.toISOString().slice(0, 10)
}

export function expandGuideHistoryStatusFilter(status?: string): SettlementStatus[] | null {
  const parsed = parseGuideHistoryStatus(status)
  return parsed ? expandWorkflowStatusFilter(parsed) : null
}

export function matchesGuideHistoryFilters(
  settlement: Pick<SettlementWithTour, 'status' | 'tour'>,
  filters: { status?: string; period?: string; search?: string },
  now = new Date(),
): boolean {
  const statuses = expandGuideHistoryStatusFilter(filters.status)
  if (statuses && !statuses.includes(settlement.status)) return false

  const period = parseGuideHistoryPeriod(filters.period)
  const since = guideHistorySinceDate(period, now)
  if (since && settlement.tour?.start_date && settlement.tour.start_date < since) return false

  const search = filters.search?.trim().toLowerCase()
  if (!search) return true
  const haystack = [
    settlement.tour?.pattern,
    settlement.tour?.tour_code,
  ].filter(Boolean).join(' ').toLowerCase()
  return haystack.includes(search)
}

export function buildGuideHistoryUrl(params: {
  status?: string
  period?: string
  search?: string
  page?: number
}): string {
  const q = new URLSearchParams()
  if (params.status) q.set('status', params.status)
  if (params.period && params.period !== 'all') q.set('period', params.period)
  if (params.search?.trim()) q.set('search', params.search.trim())
  if (params.page && params.page > 1) q.set('page', String(params.page))
  const s = q.toString()
  return s ? `/guide/settlements?${s}` : '/guide/settlements'
}
