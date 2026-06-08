import Link from 'next/link'
import { getGuideVehicleReports } from '@/lib/actions/vehicleGuideActions'
import { guideCheckListStatusLabel } from '@/lib/vehicle/guide-check'

export const dynamic = 'force-dynamic'

const fontStack =
  'Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", sans-serif'

function periodText(start: string | null, end: string | null): string {
  if (start && end) return `${start} ~ ${end}`
  return start || end || ''
}

export default async function GuideVehicleReportsPage() {
  const reports = await getGuideVehicleReports()

  return (
    <div className="min-h-screen bg-[#FCFAF7] px-4 py-4 text-[#2B2118]" style={{ fontFamily: fontStack }}>
      <div className="mx-auto max-w-[430px] space-y-4">
        <header className="rounded-[22px] border border-[#E9DED2] bg-[#FFFDF9] px-5 py-4 shadow-[0_4px_18px_rgba(43,33,24,0.03)]">
          <h1 className="text-[20px] font-bold tracking-[-0.02em] text-[#2B2118]">차량 리포트 확인</h1>
          <p className="mt-1 text-xs leading-5 text-[#8B7B6E]">
            차량회사가 제출한 리포트를 확인하고 이상 여부를 남깁니다.
          </p>
        </header>

        {reports.length === 0 ? (
          <div className="flex min-h-[84px] flex-col items-center justify-center rounded-[22px] border border-[#E9DED2] bg-[#FFFDF9] px-4 py-6 text-center shadow-[0_4px_18px_rgba(43,33,24,0.025)]">
            <p className="text-sm font-semibold text-[#2B2118]">확인할 차량 리포트가 없습니다.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.report_id}>
                <Link
                  href={`/guide/vehicle-reports/${r.tour_id}`}
                  className="block rounded-[22px] border border-[#E9DED2] bg-white px-4 py-4 shadow-[0_4px_18px_rgba(43,33,24,0.035)] transition-colors hover:border-[#F37021]/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-bold leading-6 tracking-[-0.01em] text-[#2B2118]">
                        {r.pattern || r.tour_code || '투어'}
                      </p>
                      <p className="text-xs font-mono leading-5 text-[#8B7B6E]">{r.tour_code}</p>
                      {periodText(r.start_date, r.end_date) && (
                        <p className="mt-0.5 text-xs leading-5 text-[#8B7B6E]">
                          {periodText(r.start_date, r.end_date)}
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex h-6 min-w-fit items-center justify-center rounded-full border px-2.5 text-[11px] font-semibold leading-none ${
                        r.checked
                          ? 'border-[#CFE5D8] bg-[#EAF4EE] text-[#2F7D5A]'
                          : 'border-[#F3D9A9] bg-[#FFF7E8] text-[#B7791F]'
                      }`}
                    >
                      {guideCheckListStatusLabel(r.checked)}
                    </span>
                  </div>
                  <p className="mt-3 text-xs font-bold text-[#F37021]">
                    {r.checked ? '리포트 보기 →' : '리포트 확인하기 →'}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
