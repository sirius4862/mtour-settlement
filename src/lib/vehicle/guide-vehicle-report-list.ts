import {
  addUtcDays,
  todayUtcString,
  toUtcDateString,
} from '@/lib/admin/date-range-filter'

export const GUIDE_VEHICLE_REPORT_PERIODS = ['7d', '30d', '60d'] as const
export type GuideVehicleReportPeriod = (typeof GUIDE_VEHICLE_REPORT_PERIODS)[number]

export const GUIDE_VEHICLE_REPORT_PERIOD_LABELS: Record<GuideVehicleReportPeriod, string> = {
  '7d': '최근 7일',
  '30d': '최근 30일',
  '60d': '최근 60일',
}

export const GUIDE_VEHICLE_REPORT_PERIOD_HELPER =
  '기본 조회 기간은 최근 7일입니다. 가이드는 차량 리포트를 최대 최근 60일까지 확인할 수 있습니다.'

export const GUIDE_VEHICLE_REPORT_EMPTY_MESSAGE =
  '선택한 기간에 확인할 차량 리포트가 없습니다.'

export interface GuideVehicleReportDateRange {
  from: string
  to: string
}

export function parseGuideVehicleReportPeriod(value?: string | null): GuideVehicleReportPeriod {
  return GUIDE_VEHICLE_REPORT_PERIODS.includes(value as GuideVehicleReportPeriod)
    ? (value as GuideVehicleReportPeriod)
    : '7d'
}

function recentDaysRange(days: number, now = new Date()): GuideVehicleReportDateRange {
  return {
    from: toUtcDateString(addUtcDays(now, -(days - 1))),
    to: todayUtcString(now),
  }
}

export function resolveGuideVehicleReportDateRange(
  filters: { period?: string },
  now = new Date(),
): GuideVehicleReportDateRange {
  const period = parseGuideVehicleReportPeriod(filters.period)
  switch (period) {
    case '7d':
      return recentDaysRange(7, now)
    case '30d':
      return recentDaysRange(30, now)
    case '60d':
      return recentDaysRange(60, now)
    default:
      return recentDaysRange(7, now)
  }
}

export function tourStartDateInGuideVehicleReportRange(
  startDate: string | null | undefined,
  range: GuideVehicleReportDateRange,
): boolean {
  if (!startDate) return false
  return startDate >= range.from && startDate <= range.to
}

export function buildGuideVehicleReportsUrl(period?: string): string {
  const parsed = parseGuideVehicleReportPeriod(period)
  if (parsed === '7d') return '/guide/vehicle-reports'
  return `/guide/vehicle-reports?period=${parsed}`
}
