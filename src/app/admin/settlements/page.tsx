import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/session'
import { getAdminSettlements } from '@/lib/actions/settlementActions'
import { STATUS_META } from '@/types'

export const dynamic = 'force-dynamic'

export default async function AdminSettlementsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin()
  const params = await searchParams

  const now = new Date()
  const defaultYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const settlements = await getAdminSettlements({
    yearMonth: params.yearMonth || defaultYM,
    status: params.status || undefined,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">정산서 목록</h1>
        <span className="text-xs text-gray-400">{settlements.length}건</span>
      </div>

      {/* 필터 */}
      <form className="flex flex-wrap gap-2">
        <input type="month" name="yearMonth"
          defaultValue={params.yearMonth || defaultYM}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
        <select name="status" defaultValue={params.status || ''}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="">전체 상태</option>
          {Object.entries(STATUS_META).map(([v, m]) => (
            <option key={v} value={v}>{m.label}</option>
          ))}
        </select>
        <button type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          조회
        </button>
      </form>

      {/* 목록 */}
      {settlements.length === 0 ? (
        <p className="text-sm text-gray-400 py-12 text-center">조회 결과가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {settlements.map((s: {
            id: string; status: string; year_month: string
            submitted_at: string | null
            tour: { pattern: string; tour_code: string; start_date: string; pax_count: number } | null
            guide: { full_name: string; email: string } | null
          }) => {
            const meta = STATUS_META[s.status as keyof typeof STATUS_META]
            return (
              <Link key={s.id} href={`/admin/settlements/${s.id}`}
                className="block bg-white rounded-xl border border-gray-100 hover:border-blue-200 transition-colors p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium text-gray-800">{s.tour?.pattern ?? '—'}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{s.tour?.tour_code}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${meta.bg} ${meta.text} shrink-0`}>
                    {meta.label}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span>가이드: {s.guide?.full_name}</span>
                  <span>정산월: {s.year_month}</span>
                  <span>인원: {s.tour?.pax_count}명</span>
                  {s.submitted_at && <span>제출: {s.submitted_at.slice(0,10)}</span>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
