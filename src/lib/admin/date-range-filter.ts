export const ADMIN_DATE_RANGE_CURRENT_MONTH_NOTICE =
  '기본값: 이번 달 투어만 표시됩니다.'

export const ADMIN_DATE_RANGE_ALL_WARNING =
  '전체 조회는 데이터가 많을 수 있습니다.'

export const ADMIN_DATE_RANGE_LIST_LIMIT = 200
export const ADMIN_DATE_RANGE_LIST_LIMIT_ALL = 500

export type AdminDateQuickRange =
  | 'all'
  | 'from_today'
  | 'current_month'
  | 'next_month'
  | 'prev_month'

export interface AdminDateRangeFilter {
  range: AdminDateQuickRange | 'custom'
  from: string | null
  to: string | null
}

export interface AdminDateRangeSearchParams {
  from?: string
  to?: string
  range?: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** YYYY-MM-DD in UTC — matches DB date column comparisons used elsewhere in the app. */
export function toUtcDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function currentMonthRange(referenceDate: Date = new Date()): { from: string; to: string } {
  const y = referenceDate.getUTCFullYear()
  const m = referenceDate.getUTCMonth()
  const from = `${y}-${pad2(m + 1)}-01`
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const to = `${y}-${pad2(m + 1)}-${pad2(lastDay)}`
  return { from, to }
}

export function nextMonthRange(referenceDate: Date = new Date()): { from: string; to: string } {
  const anchor = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1))
  return currentMonthRange(anchor)
}

export function prevMonthRange(referenceDate: Date = new Date()): { from: string; to: string } {
  const anchor = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - 1, 1))
  return currentMonthRange(anchor)
}

export function todayUtcString(referenceDate: Date = new Date()): string {
  return toUtcDateString(referenceDate)
}

/**
 * Resolve date filter from URL search params.
 * No date params → current calendar month.
 */
export function parseAdminDateRangeSearchParams(
  params: AdminDateRangeSearchParams | undefined,
  referenceDate: Date = new Date(),
): AdminDateRangeFilter {
  if (params?.range === 'all') {
    return { range: 'all', from: null, to: null }
  }

  if (params?.from || params?.to) {
    const today = todayUtcString(referenceDate)
    const from = params.from ?? null
    const to = params.to ?? null
    if (from === today && !to) {
      return { range: 'from_today', from, to: null }
    }
    const current = currentMonthRange(referenceDate)
    if (from === current.from && to === current.to) {
      return { range: 'current_month', from, to }
    }
    const next = nextMonthRange(referenceDate)
    if (from === next.from && to === next.to) {
      return { range: 'next_month', from, to }
    }
    const prev = prevMonthRange(referenceDate)
    if (from === prev.from && to === prev.to) {
      return { range: 'prev_month', from, to }
    }
    return { range: 'custom', from, to }
  }

  const { from, to } = currentMonthRange(referenceDate)
  return { range: 'current_month', from, to }
}

export function buildAdminDateRangeHref(
  basePath: string,
  from: string | null,
  to: string | null,
  extra?: Record<string, string | undefined>,
): string {
  const sp = new URLSearchParams()
  if (from) sp.set('from', from)
  if (to) sp.set('to', to)
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) sp.set(key, value)
    }
  }
  const q = sp.toString()
  return q ? `${basePath}?${q}` : basePath
}

export function adminDateRangeQuickUrls(
  basePath: string,
  referenceDate: Date = new Date(),
  extra?: Record<string, string | undefined>,
) {
  const today = todayUtcString(referenceDate)
  const current = currentMonthRange(referenceDate)
  const next = nextMonthRange(referenceDate)
  const prev = prevMonthRange(referenceDate)
  const allExtra = { ...extra, range: 'all' }
  const allSp = new URLSearchParams()
  allSp.set('range', 'all')
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) allSp.set(key, value)
    }
  }
  return {
    fromToday: buildAdminDateRangeHref(basePath, today, null, extra),
    currentMonth: buildAdminDateRangeHref(basePath, current.from, current.to, extra),
    nextMonth: buildAdminDateRangeHref(basePath, next.from, next.to, extra),
    prevMonth: buildAdminDateRangeHref(basePath, prev.from, prev.to, extra),
    all: `${basePath}?${allSp.toString()}`,
  } as const
}

/** App-layer mirror of the DB start_date range filter. */
export function isTourInAdminDateRange(
  startDate: string | null | undefined,
  filter: AdminDateRangeFilter,
): boolean {
  if (!startDate) return false
  if (filter.range === 'all') return true
  if (filter.from && startDate < filter.from) return false
  if (filter.to && startDate > filter.to) return false
  return true
}

export function filterToursByAdminDateRange<T extends { start_date: string | null }>(
  tours: T[],
  filter: AdminDateRangeFilter,
): T[] {
  return tours.filter((t) => isTourInAdminDateRange(t.start_date, filter))
}
