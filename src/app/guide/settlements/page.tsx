import Link from 'next/link'
import { requireGuide } from '@/lib/auth/session'
import { getMySettlements } from '@/lib/actions/settlementActions'
import { STATUS_META } from '@/types'

export const dynamic = 'force-dynamic'

export default async function SettlementsPage() {
  await requireGuide()
  const settlements = await getMySettlements()

  return (
    <div className="px-4 py-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-gray-900">내 정산서</h1>
        <Link href="/guide/settlements/new"
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v10M2 7h10" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          새 작성
        </Link>
      </div>

      {settlements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-3xl mb-3">📋</p>
          <p className="text-gray-600 font-medium">정산서가 없습니다</p>
          <p className="text-sm text-gray-400 mt-1">새 정산서를 작성해보세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {settlements.map((s) => {
            const meta = STATUS_META[s.status]
            const isEditable = ['draft', 'rejected', 'edit_requested'].includes(s.status)
            return (
              <Link key={s.id} href={`/guide/settlements/${s.id}`}
                className="block bg-white rounded-2xl p-4 border border-gray-100 hover:border-gray-200 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold text-gray-800">{s.tour?.pattern}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{s.tour?.tour_code}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${meta.bg} ${meta.text}`}>
                    {meta.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span>여행사: {s.tour?.agency_name}</span>
                  <span>정산월: {s.year_month}</span>
                  <span>기간: {s.tour?.start_date} ~ {s.tour?.end_date}</span>
                  <span>인원: {s.tour?.pax_count}명</span>
                </div>

                {s.status === 'rejected' && s.reject_reason && (
                  <div className="mt-2 px-3 py-2 bg-red-50 rounded-lg">
                    <p className="text-xs text-red-600">반려: {s.reject_reason}</p>
                  </div>
                )}

                {isEditable && (
                  <p className="mt-2 text-xs text-blue-500">
                    {s.status === 'rejected' ? '✏️ 수정 후 재제출 가능'
                    : s.status === 'edit_requested' ? '✏️ 관리자 수정 요청'
                    : '✏️ 작성 중'}
                  </p>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
