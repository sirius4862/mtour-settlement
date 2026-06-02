import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/session'
import { getAdminSettlements } from '@/lib/actions/settlementActions'
import { getBranches } from '@/lib/actions/tourActions'
import { AdminSettlementTable } from '@/components/admin/AdminSettlementTable'
import { adminRegionScopeLabel } from '@/lib/region/permissions'
import { formatRegionLabel } from '@/lib/region/regions'
import { isMasterAdmin } from '@/lib/auth/permissions'
import { STATUS_META, WORKFLOW_STATUS_ORDER } from '@/types'

export const dynamic = 'force-dynamic'

function buildListUrl(params: {
  yearMonth: string
  status: string
  search: string
  regionId: string
  page: number
}): string {
  const q = new URLSearchParams()
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.status) q.set('status', params.status)
  if (params.search) q.set('search', params.search)
  if (params.regionId) q.set('regionId', params.regionId)
  if (params.page > 1) q.set('page', String(params.page))
  const s = q.toString()
  return s ? `/admin/settlements?${s}` : '/admin/settlements'
}

export default async function AdminSettlementsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const session = await requireAdmin()
  const params = await searchParams
  const regions = await getBranches()

  const now = new Date()
  const defaultYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const yearMonth = params.yearMonth || defaultYM
  const status = params.status || ''
  const search = params.search || ''
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const regionId =
    params.regionId ||
    (!isMasterAdmin(session.role) && session.branch_id ? session.branch_id : '')

  const scope = { role: session.role, assignedRegionId: session.branch_id }
  const scopeLabel = adminRegionScopeLabel(scope)
  const assignedRegion = regions.find((r) => r.id === session.branch_id)

  const result = await getAdminSettlements({
    yearMonth,
    status: status || undefined,
    search: search || undefined,
    regionId: regionId || undefined,
    page,
  })

  const listParams = { yearMonth, status, search, regionId, page: 1 }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-900">정산서 목록</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {scopeLabel}
            {!isMasterAdmin(session.role) && assignedRegion && (
              <> · {formatRegionLabel(assignedRegion.code, assignedRegion.name)}</>
            )}
          </p>
        </div>
        <span className="text-xs text-gray-400">
          {result.total}건 · {result.page}/{Math.max(result.totalPages, 1)}페이지
        </span>
      </div>

      <form className="flex flex-wrap gap-2">
        <input
          type="month"
          name="yearMonth"
          defaultValue={yearMonth}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
        />
        {isMasterAdmin(session.role) ? (
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
        ) : (
          assignedRegion && (
            <input type="hidden" name="regionId" value={assignedRegion.id} />
          )
        )}
        <select
          name="status"
          defaultValue={status}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value="">전체 상태</option>
          {WORKFLOW_STATUS_ORDER.map((v) => (
            <option key={v} value={v}>{STATUS_META[v].label}</option>
          ))}
        </select>
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="투어명·코드·가이드·이메일"
          className="flex-1 min-w-[180px] px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          조회
        </button>
      </form>

      {result.items.length === 0 ? (
        <p className="text-sm text-gray-400 py-12 text-center">조회 결과가 없습니다.</p>
      ) : (
        <>
          <AdminSettlementTable items={result.items} />

          {result.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              {page > 1 ? (
                <Link
                  href={buildListUrl({ ...listParams, page: page - 1 })}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  이전
                </Link>
              ) : (
                <span className="px-3 py-1.5 text-sm text-gray-300">이전</span>
              )}
              <span className="text-sm text-gray-500">
                {page} / {result.totalPages}
              </span>
              {page < result.totalPages ? (
                <Link
                  href={buildListUrl({ ...listParams, page: page + 1 })}
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
  )
}
