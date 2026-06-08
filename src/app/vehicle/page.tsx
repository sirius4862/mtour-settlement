import Link from 'next/link'
import { getVehicleCompanyAssignedTours } from '@/lib/actions/vehicleReportActions'
import {
  vehicleDashboardGuideCheckLabel,
  vehicleDashboardIssueNotePreview,
  vehicleDashboardReportStatusLabel,
} from '@/lib/vehicle/vehicle-dashboard-status'
import { parseVehicleDashboardSearchParams } from '@/lib/vehicle/vehicle-list'
import { vehicleReportActionLabel, type VehicleTourReportStatus } from '@/lib/vehicle/report-status'
import { VehicleDashboardDateFilterBar } from './VehicleDashboardDateFilter'

export const dynamic = 'force-dynamic'

function periodText(start: string | null, end: string | null): string {
  if (start && end) return `${start} ~ ${end}`
  return start || end || ''
}

const REPORT_BADGE: Record<VehicleTourReportStatus, string> = {
  none: 'bg-gray-100 text-gray-600',
  draft: 'bg-amber-100 text-amber-700',
  submitted: 'bg-emerald-100 text-emerald-700',
}

const GUIDE_CHECK_BADGE = {
  pending: 'bg-slate-100 text-slate-600',
  ok: 'bg-blue-100 text-blue-700',
  issue: 'bg-rose-100 text-rose-700',
} as const

export default async function VehicleHomePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; range?: string }>
}) {
  const params = await searchParams
  const dateFilter = parseVehicleDashboardSearchParams(params)
  const hasExplicitDateParams = !!(params.from || params.to || params.range)
  const tours = await getVehicleCompanyAssignedTours(dateFilter)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-gray-900">차량회사 리포트</h1>
        <p className="mt-1 text-sm text-gray-500">
          배정된 행사에 대한 차량 리포트를 작성하고 제출합니다.
        </p>
      </div>

      <VehicleDashboardDateFilterBar
        filter={dateFilter}
        showDefaultMonthNotice={dateFilter.range === 'forward_week' && !hasExplicitDateParams}
        showAllWarning={dateFilter.range === 'all'}
      />

      {tours.length === 0 ? (
        <div className="rounded-2xl border border-orange-100 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
          배정된 차량 리포트 대상이 없습니다.
        </div>
      ) : (
        <ul className="space-y-3">
          {tours.map((tour) => {
            const guideCheckLabel = vehicleDashboardGuideCheckLabel({
              report_status: tour.report_status,
              check_status: tour.guide_check_status,
              issue_note: tour.guide_check_issue_note,
            })
            const issuePreview =
              tour.guide_check_status === 'issue_reported'
                ? vehicleDashboardIssueNotePreview(tour.guide_check_issue_note)
                : null
            const guideBadgeClass =
              tour.report_status !== 'submitted'
                ? null
                : !tour.guide_check_status
                  ? GUIDE_CHECK_BADGE.pending
                  : tour.guide_check_status === 'no_issue'
                    ? GUIDE_CHECK_BADGE.ok
                    : GUIDE_CHECK_BADGE.issue

            return (
              <li
                key={tour.id}
                className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {tour.tour_code || '투어'}
                    </p>
                    {periodText(tour.start_date, tour.end_date) && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {periodText(tour.start_date, tour.end_date)}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                      {tour.pattern && <span className="truncate">{tour.pattern}</span>}
                      {tour.guide_name && <span>가이드 {tour.guide_name}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${REPORT_BADGE[tour.report_status]}`}
                    >
                      {vehicleDashboardReportStatusLabel(tour.report_status)}
                    </span>
                    {guideCheckLabel && guideBadgeClass && (
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${guideBadgeClass}`}>
                        {guideCheckLabel}
                      </span>
                    )}
                  </div>
                </div>

                {issuePreview && (
                  <p className="mt-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                    가이드 메모: {issuePreview}
                  </p>
                )}

                <div className="mt-3 flex justify-end">
                  <Link
                    href={`/vehicle/reports/${tour.id}`}
                    className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
                  >
                    {vehicleReportActionLabel(tour.report_status)}
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
