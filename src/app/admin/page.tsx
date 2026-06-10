import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/session'
import { getAdminDashboardStats, getAdminSettlements } from '@/lib/actions/settlementActions'
import { getBranches } from '@/lib/actions/tourActions'
import { AdminSettlementTable } from '@/components/admin/AdminSettlementTable'
import { adminRegionScopeLabel } from '@/lib/region/permissions'
import { formatRegionLabel } from '@/lib/region/regions'
import { isMasterAdmin } from '@/lib/auth/permissions'
import { STATUS_META } from '@/types'
import { timed } from '@/lib/server/perf'
import {
  ADMIN_DASHBOARD_PAID_HISTORY_LABEL,
  ADMIN_DASHBOARD_PROGRESS_ALL_LABEL,
  ADMIN_DASHBOARD_STATUS_ORDER,
  ADMIN_SETTLEMENT_EMPTY_STATUS_MESSAGE,
  buildAdminDashboardListSubtitle,
  shouldFetchAdminSettlementRows,
} from '@/lib/admin/settlement-list'
import {
  parseDashboardStatusFilter,
  resolveDashboardRegionFilter,
} from '@/lib/admin/dashboard-filter'

export const dynamic = 'force-dynamic'

function buildDashboardUrl(params: {
  status?: string
  regionId?: string
  view?: string
  page?: number
}): string {
  const q = new URLSearchParams()
  if (params.status) q.set('status', params.status)
  if (params.regionId) q.set('regionId', params.regionId)
  if (params.view) q.set('view', params.view)
  if (params.page && params.page > 1) q.set('page', String(params.page))
  const s = q.toString()
  return s ? `/admin?${s}` : '/admin'
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const session = await timed('admin dashboard auth/profile', () => requireAdmin())
  const params = await searchParams
  const regions = await timed('admin dashboard regions', () => getBranches())
  const parsedStatus = parseDashboardStatusFilter(params.status)
  const activeStatus = parsedStatus && ADMIN_DASHBOARD_STATUS_ORDER.includes(parsedStatus)
    ? parsedStatus
    : ''
  const view = params.view === 'all' && !activeStatus ? 'all' : ''
  const regionId = resolveDashboardRegionFilter({
    role: session.role,
    assignedRegionId: session.branch_id,
    requestedRegionId: params.regionId,
  })
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const shouldFetchRows = shouldFetchAdminSettlementRows({
    status: activeStatus,
    view,
  })

  const [stats, settlements] = await Promise.all([
    timed('admin dashboard settlement status counts', () =>
      getAdminDashboardStats({ regionId: regionId || undefined }),
    ),
    shouldFetchRows
      ? timed('admin dashboard settlement list', () =>
          getAdminSettlements({
            status: activeStatus || undefined,
            regionId: regionId || undefined,
            dashboardProgressOnly: view === 'all' ? true : undefined,
            page,
          }),
        )
      : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 }),
  ])

  const scope = { role: session.role, assignedRegionId: session.branch_id }
  const assignedRegion = regions.find((r) => r.id === session.branch_id)
  const currentRegion = regions.find((r) => r.id === regionId)
  const regionLabel = currentRegion
    ? formatRegionLabel(currentRegion.code, currentRegion.name)
    : isMasterAdmin(session.role)
      ? '전체 지역'
      : assignedRegion
        ? formatRegionLabel(assignedRegion.code, assignedRegion.name)
        : '지역 미지정'
  const activeMeta = activeStatus ? STATUS_META[activeStatus] : null
  const listSubtitle = buildAdminDashboardListSubtitle({
    regionLabel,
    statusLabel: activeMeta?.label,
    view,
  })
  const statsByStatus = new Map(stats.map((s) => [s.status, s.count]))
  const displayItems = settlements.items

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

      {isMasterAdmin(session.role) && (
        <form className="flex items-center gap-2">
          {activeStatus && <input type="hidden" name="status" value={activeStatus} />}
          {view && <input type="hidden" name="view" value={view} />}
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
            <h2 className="text-sm font-semibold text-gray-700">상태별 정산서</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              카드를 선택하면 해당 상태의 정산서만 표시됩니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={buildDashboardUrl({ regionId, view: 'all' })}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                view === 'all'
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-blue-600 hover:bg-gray-50'
              }`}
            >
              {ADMIN_DASHBOARD_PROGRESS_ALL_LABEL}
            </Link>
            <Link
              href={`/admin/settlements?status=paid${regionId ? `&regionId=${regionId}` : ''}`}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            >
              {ADMIN_DASHBOARD_PAID_HISTORY_LABEL}
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ADMIN_DASHBOARD_STATUS_ORDER.map((status) => {
            const meta = STATUS_META[status]
            const isActive = activeStatus === status
            return (
              <Link
                key={status}
                href={buildDashboardUrl({ status, regionId })}
                aria-current={isActive ? 'page' : undefined}
                className={`rounded-2xl p-4 border text-center transition-colors ${
                  isActive
                    ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-100'
                    : 'bg-white border-gray-100 hover:border-blue-200 hover:bg-blue-50/40'
                }`}
              >
                <p className="text-2xl font-bold text-gray-800">{statsByStatus.get(status) ?? 0}</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.bg} ${meta.text} mt-1 inline-block`}>
                  {meta.label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">정산서 목록</h2>
            <p className="text-xs text-gray-400 mt-0.5">{listSubtitle}</p>
          </div>
          <span className="text-xs text-gray-400">
            {shouldFetchRows
              ? `${displayItems.length}건 · ${settlements.page}/${Math.max(settlements.totalPages, 1)}페이지`
              : '상태 미선택'}
          </span>
        </div>
        {!shouldFetchRows ? (
          <p className="text-sm text-gray-400 py-12 text-center">
            {ADMIN_SETTLEMENT_EMPTY_STATUS_MESSAGE}
          </p>
        ) : displayItems.length === 0 ? (
          <p className="text-sm text-gray-400 py-12 text-center">조회 결과가 없습니다.</p>
        ) : (
          <>
            <AdminSettlementTable items={displayItems} />
            {settlements.totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                {page > 1 ? (
                  <Link
                    href={buildDashboardUrl({
                      status: activeStatus,
                      regionId,
                      view,
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
                    href={buildDashboardUrl({
                      status: activeStatus,
                      regionId,
                      view,
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
