import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/session'
import { getAdminTours } from '@/lib/actions/tourActions'

export const dynamic = 'force-dynamic'

export default async function AdminToursPage() {
  await requireAdmin()
  const tours = await getAdminTours()

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">투어 관리</h1>
          <p className="text-xs text-gray-400 mt-0.5">{tours.length}건 · 가이드 정산용</p>
        </div>
        <Link
          href="/admin/tours/new"
          className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v10M2 7h10" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          투어 등록
        </Link>
      </div>

      {tours.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <p className="text-gray-500 text-sm">등록된 투어가 없습니다.</p>
          <Link href="/admin/tours/new" className="text-sm text-blue-600 mt-2 inline-block">
            첫 투어 등록하기 →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {tours.map((t) => {
            const guideVisible = t.start_date >= since
            return (
              <div
                key={t.id}
                className="bg-white rounded-xl border border-gray-100 p-4"
              >
                <div className="flex justify-between items-start gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 truncate">{t.pattern}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{t.tour_code}</p>
                  </div>
                  {guideVisible ? (
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                      가이드 선택 가능
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                      90일 지남
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span>가이드: {t.guide?.full_name ?? '—'}</span>
                  <span>여행사: {t.agency_name}</span>
                  <span>
                    기간: {t.start_date} ~ {t.end_date}
                  </span>
                  <span>
                    {t.pax_count}명 · {t.vehicle_type ?? '—'} · TC {t.tc_name ?? '—'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
