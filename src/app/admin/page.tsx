import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/session'
import { getAdminActionQueue, getAdminDashboardStats } from '@/lib/actions/settlementActions'
import { AdminSettlementQueueRow } from '@/components/admin/AdminSettlementTable'
import { STATUS_META } from '@/types'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  await requireAdmin()

  const [stats, actionQueue] = await Promise.all([
    getAdminDashboardStats(),
    getAdminActionQueue(10),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">관리자 대시보드</h1>
        <p className="text-sm text-gray-500 mt-0.5">전체 정산 기준</p>
        <Link href="/admin/tours/new" className="text-sm text-blue-600 mt-2 inline-block">
          + 투어 등록 (가이드 정산 테스트용)
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">처리 필요 정산서</h2>
          <Link
            href="/admin/settlements"
            className="text-xs text-blue-600"
          >
            전체 보기
          </Link>
        </div>
        <p className="text-xs text-gray-400 mb-2">
          이의 요청 → 확인 대기 → 검토 대기 순
        </p>
        {actionQueue.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">처리 필요 정산서가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {actionQueue.map((s) => (
              <AdminSettlementQueueRow key={s.id} s={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
