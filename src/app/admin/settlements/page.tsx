import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/session'
import { getAdminSettlements } from '@/lib/actions/settlementActions'
import { getBranches } from '@/lib/actions/tourActions'
import { AdminSettlementTable } from '@/components/admin/AdminSettlementTable'
import { adminRegionScopeLabel } from '@/lib/region/permissions'
import { formatRegionLabel } from '@/lib/region/regions'
import { isMasterAdmin } from '@/lib/auth/permissions'
import { STATUS_META, WORKFLOW_STATUS_ORDER } from '@/types'
import {
  buildAdminSettlementSearchSubtitle,
  defaultAdminSettlementDateRange,
  validateAdminSettlementDateRange,
} from '@/lib/admin/settlement-list'

export const dynamic = 'force-dynamic'

function buildListUrl(params: {
  startDate: string
  endDate: string
  status: string
  search: string
  regionId: string
  page: number
}): string {
  const q = new URLSearchParams()
  if (params.startDate) q.set('startDate', params.startDate)
  if (params.endDate) q.set('endDate', params.endDate)
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

  const defaultRange = defaultAdminSettlementDateRange()
  const startDate = params.startDate || defaultRange.startDate
  const endDate = params.endDate || defaultRange.endDate
  const status = params.status || ''
  const search = params.search || ''
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const regionId =
    params.regionId ||
    (!isMasterAdmin(session.role) && session.branch_id ? session.branch_id : '')

  const scope = { role: session.role, assignedRegionId: session.branch_id }
  const scopeLabel = adminRegionScopeLabel(scope)
  const assignedRegion = regions.find((r) => r.id === session.branch_id)
  const selectedRegion = regions.find((r) => r.id === regionId)
  const regionLabel = selectedRegion
    ? formatRegionLabel(selectedRegion.code, selectedRegion.name)
    : '전체 지역'
  const selectedStatusLabel = status
    ? STATUS_META[status as keyof typeof STATUS_META]?.label
    : '전체 상태'
  const listSubtitle = buildAdminSettlementSearchSubtitle({
    startDate,
    endDate,
    regionLabel,
    statusLabel: selectedStatusLabel,
    search,
  })
  const dateRangeValidation = validateAdminSettlementDateRange({ startDate, endDate })

  const result = dateRangeValidation.ok
    ? await getAdminSettlements({
        startDate,
        endDate,
        status: status || undefined,
        search: search || undefined,
        regionId: regionId || undefined,
        page,
      })
    : { items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 }

  const listParams = { startDate, endDate, status, search, regionId, page: 1 }

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
          {dateRangeValidation.ok
            ? `${result.total}건 · ${result.page}/${Math.max(result.totalPages, 1)}페이지`
            : '조회 조건 확인 필요'}
        </span>
      </div>

      <form className="flex flex-wrap gap-2">
        <label className="flex items-center gap-1 text-xs text-gray-500">
          시작일
          <input
            type="date"
            name="startDate"
            defaultValue={startDate}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-700"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          종료일
          <input
            type="date"
            name="endDate"
            defaultValue={endDate}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-700"
          />
        </label>
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

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">검색 결과</h2>
          <p className="text-xs text-gray-500 mt-0.5">{listSubtitle}</p>
        </div>
      </div>

      {!dateRangeValidation.ok ? (
        <p className="text-sm text-rose-500 py-12 text-center">
          {dateRangeValidation.message}
        </p>
      ) : result.items.length === 0 ? (
        <p className="text-sm text-gray-400 py-12 text-center">
          조회 조건에 맞는 정산서가 없습니다.
        </p>
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
