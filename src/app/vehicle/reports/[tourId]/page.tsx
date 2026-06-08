import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getVehicleReportForTour } from '@/lib/actions/vehicleReportActions'
import { VehicleReportForm } from './VehicleReportForm'

export const dynamic = 'force-dynamic'

function periodText(start: string | null, end: string | null): string {
  if (start && end) return `${start} ~ ${end}`
  return start || end || ''
}

export default async function VehicleReportPage({
  params,
}: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params
  const data = await getVehicleReportForTour(tourId)
  if (!data) redirect('/vehicle')

  const { tour, report } = data
  const period = periodText(tour.start_date, tour.end_date)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/vehicle" className="text-gray-400 hover:text-gray-700" aria-label="목록으로">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.5 15L7.5 10l5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold text-gray-900">차량 리포트</h1>
      </div>

      <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-900">{tour.tour_code || '투어'}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
          {period && <span>{period}</span>}
          {tour.pattern && <span>{tour.pattern}</span>}
          {tour.pax_count != null && <span>{tour.pax_count}명</span>}
          {tour.guide_name && <span>가이드 {tour.guide_name}</span>}
        </div>
      </div>

      <VehicleReportForm tourId={tourId} report={report} />
    </div>
  )
}
