import Link from 'next/link'
import { requireGuide } from '@/lib/auth/session'
import { getMySettlements } from '@/lib/actions/settlementActions'
import { STATUS_META } from '@/types'

export const dynamic = 'force-dynamic'

export default async function GuidePage() {
  const session = await requireGuide()
  const settlements = await getMySettlements()

  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const thisMonth = settlements.filter(s => s.year_month === ym)

  const counts = {
    draft:     thisMonth.filter(s => s.status === 'draft').length,
    submitted: thisMonth.filter(s => s.status === 'submitted').length,
    approved:  thisMonth.filter(s => ['approved', 'paid'].includes(s.status)).length,
  }

  return (
    <div className="px-4 py-5 space-y-5">
      {/* 인사 */}
      <div>
        <p className="text-gray-500 text-sm">안녕하세요,</p>
        <h1 className="text-xl font-bold text-gray-900">{session.full_name} 가이드님 👋</h1>
      </div>

      {/* 이달 현황 */}
      <div className="bg-blue-600 rounded-2xl p-5 text-white">
        <p className="text-blue-200 text-sm mb-3">{ym} 정산 현황</p>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: '작성중', value: counts.draft, color: 'text-blue-200' },
            { label: '검토중', value: counts.submitted, color: 'text-amber-300' },
            { label: '완료', value: counts.approved, color: 'text-emerald-300' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-blue-300 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 빠른 액션 */}
      <Link href="/guide/settlements/new"
        className="flex items-center gap-4 bg-white rounded-2xl p-4 border border-gray-100 hover:border-blue-200 transition-colors">
        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="#2563EB" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <p className="font-semibold text-gray-800">새 정산서 작성</p>
          <p className="text-sm text-gray-500 mt-0.5">투어 선택 후 입력 시작</p>
        </div>
        <svg className="ml-auto text-gray-300" width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </Link>

      {/* 최근 정산서 */}
      {settlements.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700">최근 정산서</p>
            <Link href="/guide/settlements" className="text-xs text-blue-600">전체 보기</Link>
          </div>
          <div className="space-y-2">
            {settlements.slice(0, 5).map((s) => {
              const meta = STATUS_META[s.status]
              return (
                <Link key={s.id} href={`/guide/settlements/${s.id}`}
                  className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-gray-100 hover:border-gray-200 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{s.tour?.pattern}</p>
                    <p className="text-xs text-gray-400 font-mono">{s.tour?.tour_code}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.bg} ${meta.text} shrink-0`}>
                    {meta.label}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
