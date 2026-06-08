import Link from 'next/link'
import { getVehicleCompanyAssignedTours } from '@/lib/actions/vehicleReportActions'
import {
  vehicleReportActionLabel,
  vehicleReportStatusLabel,
  type VehicleTourReportStatus,
} from '@/lib/vehicle/report-status'

export const dynamic = 'force-dynamic'

function periodText(start: string | null, end: string | null): string {
  if (start && end) return `${start} ~ ${end}`
  return start || end || ''
}

const STATUS_BADGE: Record<VehicleTourReportStatus, string> = {
  none: 'bg-gray-100 text-gray-600',
  draft: 'bg-amber-100 text-amber-700',
  submitted: 'bg-emerald-100 text-emerald-700',
}

export default async function VehicleHomePage() {
  const tours = await getVehicleCompanyAssignedTours()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-gray-900">차량회사 리포트</h1>
        <p className="mt-1 text-sm text-gray-500">
          배정된 행사에 대한 차량 리포트를 작성하고 제출합니다.
        </p>
      </div>

      {tours.length === 0 ? (
        <div className="rounded-2xl border border-orange-100 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
          배정된 차량 리포트 대상이 없습니다.
        </div>
      ) : (
        <ul className="space-y-3">
          {tours.map((tour) => (
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
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_BADGE[tour.report_status]}`}
                >
                  {vehicleReportStatusLabel(tour.report_status)}
                </span>
              </div>

              <div className="mt-3 flex justify-end">
                <Link
                  href={`/vehicle/reports/${tour.id}`}
                  className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
                >
                  {vehicleReportActionLabel(tour.report_status)}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
