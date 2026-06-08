import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getGuideVehicleReportDetail } from '@/lib/actions/vehicleGuideActions'
import { GuideVehicleCheckForm } from './GuideVehicleCheckForm'

export const dynamic = 'force-dynamic'

const fontStack =
  'Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", sans-serif'

function periodText(start: string | null, end: string | null): string {
  if (start && end) return `${start} ~ ${end}`
  return start || end || ''
}

const cardClass = 'rounded-[22px] border border-[#E9DED2] bg-white p-4 shadow-[0_4px_18px_rgba(43,33,24,0.035)]'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#2B2118]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#F37021]" aria-hidden="true" />
      {children}
    </h2>
  )
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-[#8B7B6E]">{label}</p>
      <p className="text-sm text-[#2B2118] whitespace-pre-wrap">{value || '-'}</p>
    </div>
  )
}

export default async function GuideVehicleReportDetailPage({
  params,
}: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params
  const data = await getGuideVehicleReportDetail(tourId)
  if (!data) redirect('/guide/vehicle-reports')

  const { tour, report, check } = data
  const period = periodText(tour.start_date, tour.end_date)

  return (
    <div className="min-h-screen bg-[#FCFAF7] px-4 py-4 text-[#2B2118]" style={{ fontFamily: fontStack }}>
      <div className="mx-auto max-w-[430px] space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/guide/vehicle-reports" className="text-[#8B7B6E] hover:text-[#2B2118]" aria-label="목록으로">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 15L7.5 10l5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </Link>
          <h1 className="text-lg font-bold text-[#2B2118]">차량 리포트 확인</h1>
        </div>

        <div className={cardClass}>
          <p className="text-sm font-semibold text-[#2B2118]">{tour.tour_code || '투어'}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#8B7B6E]">
            {period && <span>{period}</span>}
            {tour.pattern && <span>{tour.pattern}</span>}
            {tour.pax_count != null && <span>{tour.pax_count}명</span>}
          </div>
        </div>

        <section className={cardClass}>
          <SectionTitle>기본정보</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ReadField label="행사코드" value={report.event_code} />
            <ReadField label="행사기간" value={report.event_period_text} />
            <ReadField label="인원" value={report.pax_text} />
            <ReadField label="항공편" value={report.flight_info_text} />
            <ReadField label="차량" value={report.vehicle_text} />
            <ReadField label="호텔" value={report.hotel_text} />
            <ReadField label="가이드" value={report.guide_text} />
          </div>
        </section>

        <section className={cardClass}>
          <SectionTitle>날짜별 동선</SectionTitle>
          {report.daily_routes.length === 0 ? (
            <p className="text-sm text-[#8B7B6E]">등록된 동선이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {report.daily_routes.map((row, i) => (
                <li key={i} className="rounded-xl border border-[#E9DED2] bg-[#FFFDF9] px-3 py-2">
                  <p className="text-xs font-medium text-[#8B7B6E]">{row.date || '날짜 미입력'}</p>
                  <p className="mt-0.5 text-sm text-[#2B2118] whitespace-pre-wrap">{row.route || '-'}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={cardClass}>
          <SectionTitle>특이사항</SectionTitle>
          <p className="text-sm text-[#2B2118] whitespace-pre-wrap">{report.special_notes || '-'}</p>
        </section>

        <GuideVehicleCheckForm tourId={tourId} check={check} />
      </div>
    </div>
  )
}
