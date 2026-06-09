import type { SettlementStatus, SettlementWithTour } from '@/types'
import { expandWorkflowStatusFilter } from '@/lib/admin/settlement-list'
import {
  currentMonthRange,
  prevMonthRange,
  addUtcDays,
  todayUtcString,
  toUtcDateString,
} from '@/lib/admin/date-range-filter'
import { isWorkflowStatus } from '@/lib/settlement/status-display'

export const GUIDE_SETTLEMENT_HISTORY_PAGE_SIZE = 20

export const GUIDE_HISTORY_PERIODS = [
  '7d',
  '30d',
  'current_month',
  'prev_month',
  'custom',
] as const
export type GuideHistoryPeriod = (typeof GUIDE_HISTORY_PERIODS)[number]

export const GUIDE_HISTORY_PERIOD_LABELS: Record<GuideHistoryPeriod, string> = {
  '7d': '최근 7일',
  '30d': '최근 30일',
  current_month: '이번 달',
  prev_month: '지난 달',
  custom: '직접 설정',
}

export const GUIDE_HISTORY_PERIOD_HELPER =
  '기본 조회 기간은 최근 7일입니다. 기간을 변경하면 이전 정산서도 확인할 수 있습니다.'

export const GUIDE_HISTORY_EMPTY_MESSAGE =
  '선택한 기간에 조회되는 정산서가 없습니다. 기간 또는 검색어를 변경해보세요.'

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
  from?: string
  to?: string
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

export interface GuideHistoryDateRange {
  from: string | null
  to: string | null
}

export function parseGuideHistoryStatus(value?: string | null): SettlementStatus | '' {
  return value && isWorkflowStatus(value as SettlementStatus)
    ? (value as SettlementStatus)
    : ''
}

export function parseGuideHistoryPeriod(value?: string | null): GuideHistoryPeriod {
  return GUIDE_HISTORY_PERIODS.includes(value as GuideHistoryPeriod)
    ? (value as GuideHistoryPeriod)
    : '7d'
}

export function normalizeGuideHistoryPage(value?: number | string | null): number {
  const page = typeof value === 'number' ? value : parseInt(value || '1', 10)
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

/** 최근 7일: 오늘 포함 이전 6일 (총 7일). */
export function guideHistoryRecent7Days(now = new Date()): GuideHistoryDateRange {
  return {
    from: toUtcDateString(addUtcDays(now, -6)),
    to: todayUtcString(now),
  }
}

/** 최근 30일: 오늘 포함 이전 29일 (총 30일). */
export function guideHistoryRecent30Days(now = new Date()): GuideHistoryDateRange {
  return {
    from: toUtcDateString(addUtcDays(now, -29)),
    to: todayUtcString(now),
  }
}

export function resolveGuideHistoryDateRange(
  filters: { period?: string; from?: string; to?: string },
  now = new Date(),
): GuideHistoryDateRange {
  const period = parseGuideHistoryPeriod(filters.period)
  switch (period) {
    case '7d':
      return guideHistoryRecent7Days(now)
    case '30d':
      return guideHistoryRecent30Days(now)
    case 'current_month': {
      const { from, to } = currentMonthRange(now)
      return { from, to }
    }
    case 'prev_month': {
      const { from, to } = prevMonthRange(now)
      return { from, to }
    }
    case 'custom': {
      const from = filters.from?.trim() || null
      const to = filters.to?.trim() || null
      if (from && to) return { from, to }
      return guideHistoryRecent7Days(now)
    }
    default:
      return guideHistoryRecent7Days(now)
  }
}

/** @deprecated Use resolveGuideHistoryDateRange — kept for callers migrating off since-only filters. */
export function guideHistorySinceDate(period: GuideHistoryPeriod, now = new Date()): string | null {
  const range = resolveGuideHistoryDateRange({ period }, now)
  return range.from
}

export function tourStartDateInGuideHistoryRange(
  startDate: string | null | undefined,
  range: GuideHistoryDateRange,
): boolean {
  if (!startDate) return true
  if (range.from && startDate < range.from) return false
  if (range.to && startDate > range.to) return false
  return true
}

export function expandGuideHistoryStatusFilter(status?: string): SettlementStatus[] | null {
  const parsed = parseGuideHistoryStatus(status)
  return parsed ? expandWorkflowStatusFilter(parsed) : null
}

export function matchesGuideHistoryFilters(
  settlement: Pick<SettlementWithTour, 'status' | 'tour'>,
  filters: { status?: string; period?: string; from?: string; to?: string; search?: string },
  now = new Date(),
): boolean {
  const statuses = expandGuideHistoryStatusFilter(filters.status)
  if (statuses && !statuses.includes(settlement.status)) return false

  const range = resolveGuideHistoryDateRange(filters, now)
  if (!tourStartDateInGuideHistoryRange(settlement.tour?.start_date, range)) return false

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
  from?: string
  to?: string
  search?: string
  page?: number
}): string {
  const q = new URLSearchParams()
  if (params.status) q.set('status', params.status)
  const period = parseGuideHistoryPeriod(params.period)
  if (period !== '7d') q.set('period', period)
  if (period === 'custom') {
    if (params.from?.trim()) q.set('from', params.from.trim())
    if (params.to?.trim()) q.set('to', params.to.trim())
  }
  if (params.search?.trim()) q.set('search', params.search.trim())
  if (params.page && params.page > 1) q.set('page', String(params.page))
  const s = q.toString()
  return s ? `/guide/settlements?${s}` : '/guide/settlements'
}
