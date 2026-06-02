import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/session'
import { getAdminActionQueue, getAdminDashboardStats } from '@/lib/actions/settlementActions'
import { getBranches } from '@/lib/actions/tourActions'
import { AdminSettlementQueueRow } from '@/components/admin/AdminSettlementTable'
import { adminRegionScopeLabel } from '@/lib/region/permissions'
import { formatRegionLabel } from '@/lib/region/regions'
import { isMasterAdmin } from '@/lib/auth/permissions'
import { STATUS_META } from '@/types'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await requireAdmin()
  const regions = await getBranches()

  const [stats, actionQueue] = await Promise.all([
    getAdminDashboardStats(),
    getAdminActionQueue(10),
  ])

  const scope = { role: session.role, assignedRegionId: session.branch_id }
  const assignedRegion = regions.find((r) => r.id === session.branch_id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">관리자 대시보드</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {adminRegionScopeLabel(scope)}
          {!isMasterAdmin(session.role) && assignedRegion && (
            <> · {formatRegionLabel(assignedRegion.code, assignedRegion.name)}</>
          )}
          {isMasterAdmin(session.role) && ' · 전체 지역 집계'}
        </p>
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
          제출됨 → 최종확인 순
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
