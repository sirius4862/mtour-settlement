import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/session'
import { getAdminVehicleReportDetail } from '@/lib/actions/vehicleCompanyAdminActions'
import {
  adminVehicleReportGuideCheckDetailLabel,
} from '@/lib/vehicle/admin-vehicle-report'
import { VEHICLE_REPORT_BASIC_INFO_FIELDS } from '@/lib/vehicle/vehicle-report-form'

export const dynamic = 'force-dynamic'

function periodText(start: string | null, end: string | null): string {
  if (start && end) return `${start} ~ ${end}`
  return start || end || ''
}

function formatDateTime(value: string | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleString('ko-KR')
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-gray-500">{label}</p>
      <p className="text-sm text-gray-900 whitespace-pre-wrap">{value || '-'}</p>
    </div>
  )
}

export default async function AdminVehicleReportDetailPage({
  params,
}: { params: Promise<{ tourId: string }> }) {
  await requireAdmin()
  const { tourId } = await params
  const data = await getAdminVehicleReportDetail(tourId)
  if (!data) redirect('/admin/vehicle-assignments')

  const { tour, report, guide_check } = data
  const period = periodText(tour.start_date, tour.end_date)
  const guideCheckLabel = adminVehicleReportGuideCheckDetailLabel(guide_check)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/vehicle-assignments"
          className="text-gray-400 hover:text-gray-700"
          aria-label="차량 배정 목록으로"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.5 15L7.5 10l5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold text-gray-900">차량 리포트</h1>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-900">{tour.tour_code || '투어'}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
          {period && <span>{period}</span>}
          {tour.guide_name && <span>가이드 {tour.guide_name}</span>}
          {tour.vehicle_company_name && <span>차량회사 {tour.vehicle_company_name}</span>}
        </div>
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-gray-800">기본정보</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {VEHICLE_REPORT_BASIC_INFO_FIELDS.map(({ label, key }) => (
            <ReadField key={key} label={label} value={report[key]} />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-gray-800">날짜별 동선</h2>
        {report.daily_routes.length === 0 ? (
          <p className="text-sm text-gray-400">등록된 동선이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {report.daily_routes.map((row, i) => (
              <li key={i} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                <p className="text-xs font-medium text-gray-500">{row.date || '날짜 미입력'}</p>
                <p className="mt-0.5 text-sm text-gray-800 whitespace-pre-wrap">{row.route || '-'}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-gray-800">특이사항</h2>
        <p className="text-sm text-gray-900 whitespace-pre-wrap">{report.special_notes || '-'}</p>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-gray-800">제출 정보</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ReadField label="제출일시" value={formatDateTime(report.submitted_at)} />
          <ReadField label="제출자" value={report.submitted_by_name ?? ''} />
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-gray-800">가이드 확인</h2>
        <div className="space-y-2 text-sm text-gray-800">
          <p>{guideCheckLabel}</p>
          {guide_check?.checked_at && (
            <p className="text-xs text-gray-500">확인일시: {formatDateTime(guide_check.checked_at)}</p>
          )}
          {guide_check?.guide_name && (
            <p className="text-xs text-gray-500">확인 가이드: {guide_check.guide_name}</p>
          )}
          {guide_check?.issue_note?.trim() && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
              <p className="text-xs font-medium text-amber-700">이상 메모</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{guide_check.issue_note}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
