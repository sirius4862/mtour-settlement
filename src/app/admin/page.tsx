import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/session'
import { getAdminDashboardStats, getAdminSettlements } from '@/lib/actions/settlementActions'
import { getBranches } from '@/lib/actions/tourActions'
import { AdminSettlementTable } from '@/components/admin/AdminSettlementTable'
import { adminRegionScopeLabel } from '@/lib/region/permissions'
import { formatRegionLabel } from '@/lib/region/regions'
import { isMasterAdmin } from '@/lib/auth/permissions'
import { STATUS_META } from '@/types'
import {
  buildAdminDashboardUrl,
  parseDashboardStatusFilter,
  resolveDashboardRegionFilter,
} from '@/lib/admin/dashboard-filter'

export const dynamic = 'force-dynamic'

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const session = await requireAdmin()
  const params = await searchParams
  const regions = await getBranches()
  const activeStatus = parseDashboardStatusFilter(params.status)
  const regionId = resolveDashboardRegionFilter({
    role: session.role,
    assignedRegionId: session.branch_id,
    requestedRegionId: params.regionId,
  })
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1)

  const [stats, settlements] = await Promise.all([
    getAdminDashboardStats({ regionId: regionId || undefined }),
    getAdminSettlements({
      status: activeStatus || undefined,
      regionId: regionId || undefined,
      page,
    }),
  ])

  const scope = { role: session.role, assignedRegionId: session.branch_id }
  const assignedRegion = regions.find((r) => r.id === session.branch_id)
  const currentRegion = regions.find((r) => r.id === regionId)
  const activeMeta = activeStatus ? STATUS_META[activeStatus] : null

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

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">상태별 정산서</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            카드를 선택하면 해당 상태의 정산서만 표시됩니다.
          </p>
        </div>
        <Link
          href={buildAdminDashboardUrl({ regionId })}
          className={`px-3 py-2 rounded-xl text-xs font-semibold border ${
            activeStatus
              ? 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              : 'bg-gray-900 text-white border-gray-900'
          }`}
        >
          전체 보기
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {stats.map(({ status, count }) => {
          const meta = STATUS_META[status]
          const isActive = activeStatus === status
          return (
            <Link
              key={status}
              href={buildAdminDashboardUrl({ status, regionId })}
              aria-current={isActive ? 'page' : undefined}
              className={`rounded-2xl p-4 border text-center transition-colors ${
                isActive
                  ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-100'
                  : 'bg-white border-gray-100 hover:border-blue-200 hover:bg-blue-50/40'
              }`}
            >
              <p className="text-2xl font-bold text-gray-800">{count}</p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.bg} ${meta.text} mt-1 inline-block`}>
                {meta.label}
              </span>
            </Link>
          )
        })}
      </div>

      {isMasterAdmin(session.role) && (
        <form className="flex items-center gap-2">
          {activeStatus && <input type="hidden" name="status" value={activeStatus} />}
          <select
            name="regionId"
            defaultValue={regionId}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            <option value="">전체 지역</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {formatRegionLabel(r.code, r.name)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            지역 적용
          </button>
        </form>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">정산서 목록</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {currentRegion
                ? formatRegionLabel(currentRegion.code, currentRegion.name)
                : isMasterAdmin(session.role)
                  ? '전체 지역'
                  : assignedRegion
                    ? formatRegionLabel(assignedRegion.code, assignedRegion.name)
                    : '지역 미지정'}
              {activeMeta ? ` · ${activeMeta.label}` : ' · 전체 상태'}
            </p>
          </div>
          <span className="text-xs text-gray-400">
            {settlements.total}건 · {settlements.page}/{Math.max(settlements.totalPages, 1)}페이지
          </span>
        </div>
        {settlements.items.length === 0 ? (
          <p className="text-sm text-gray-400 py-12 text-center">조회 결과가 없습니다.</p>
        ) : (
          <>
            <AdminSettlementTable items={settlements.items} />
            {settlements.totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                {page > 1 ? (
                  <Link
                    href={buildAdminDashboardUrl({
                      status: activeStatus,
                      regionId,
                      page: page - 1,
                    })}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    이전
                  </Link>
                ) : (
                  <span className="px-3 py-1.5 text-sm text-gray-300">이전</span>
                )}
                <span className="text-sm text-gray-500">
                  {page} / {settlements.totalPages}
                </span>
                {page < settlements.totalPages ? (
                  <Link
                    href={buildAdminDashboardUrl({
                      status: activeStatus,
                      regionId,
                      page: page + 1,
                    })}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    다음
                  </Link>
                ) : (
                  <span className="px-3 py-1.5 text-sm text-gray-300">다음</span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
