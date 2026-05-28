import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/session'
import { getAdminSettlements } from '@/lib/actions/settlementActions'
import { STATUS_META } from '@/types'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  await requireAdmin()
  const all = await getAdminSettlements()

  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const thisMonth = all.filter((s: { year_month: string }) => s.year_month === ym)

  const stats = ['draft','submitted','approved','rejected','edit_requested','paid']
    .map(status => ({
      status: status as keyof typeof STATUS_META,
      count: thisMonth.filter((s: { status: string }) => s.status === status).length,
    }))

  const pending = all.filter((s: { status: string }) => s.status === 'submitted').slice(0, 5)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">관리자 대시보드</h1>
        <p className="text-sm text-gray-500 mt-0.5">{ym} 기준</p>
        <Link href="/admin/tours/new" className="text-sm text-blue-600 mt-2 inline-block">
          + 투어 등록 (가이드 정산 테스트용)
        </Link>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {stats.map(({ status, count }) => {
          const meta = STATUS_META[status]
          return (
            <div key={status} className="bg-white rounded-2xl p-4 border border-gray-100 text-center">
              <p className="text-2xl font-bold text-gray-800">{count}</p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.bg} ${meta.text} mt-1 inline-block`}>
                {meta.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* 검토 대기 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">검토 대기</h2>
          <Link href="/admin/settlements?status=submitted" className="text-xs text-blue-600">전체 보기</Link>
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">검토 대기 정산서가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((s: {
              id: string; status: string; year_month: string
              submitted_at: string | null
              tour: { pattern: string; tour_code: string; pax_count: number } | null
              guide: { full_name: string; email: string } | null
            }) => (
              <Link key={s.id} href={`/admin/settlements/${s.id}`}
                className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-amber-100 hover:border-amber-200 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{s.tour?.pattern}</p>
                  <p className="text-xs text-gray-400">{s.guide?.full_name} · {s.year_month}</p>
                </div>
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">
                  검토 대기
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
