import Link from 'next/link'
import { requireGuide } from '@/lib/auth/session'
import { getMySettlementHistory } from '@/lib/actions/settlementActions'
import { STATUS_META, type SettlementStatus } from '@/types'
import { getSettlementStatusDisplay } from '@/lib/settlement/status-display'
import {
  GUIDE_HISTORY_STATUS_ORDER,
  buildGuideHistoryUrl,
  parseGuideHistoryPeriod,
  parseGuideHistoryStatus,
} from '@/lib/guide/settlement-history'

export const dynamic = 'force-dynamic'

const PERIOD_OPTIONS = [
  { value: '30d', label: '최근 30일' },
  { value: '90d', label: '최근 90일' },
  { value: '1y', label: '최근 1년' },
  { value: 'all', label: '전체' },
] as const

function settlementHref(s: {
  id: string
  status: SettlementStatus
  guide_confirmed_at?: string | null
}): string {
  if (s.status === 'pending_guide_confirmation' && s.guide_confirmed_at == null) {
    return `/guide/settlements/${s.id}/confirm`
  }
  if (s.status === 'draft' || s.status === 'rejected' || s.status === 'edit_requested') {
    return `/guide/settlements/${s.id}/edit`
  }
  return `/guide/settlements/${s.id}`
}

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireGuide()
  const params = await searchParams
  const status = parseGuideHistoryStatus(params.status)
  const period = parseGuideHistoryPeriod(params.period)
  const search = params.search?.trim() ?? ''
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const result = await getMySettlementHistory({
    status: status || undefined,
    period,
    search: search || undefined,
    page,
  })
  const listParams = { status, period, search, page: 1 }

  return (
    <div className="px-4 py-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/guide" className="text-xs text-gray-400 hover:text-gray-600">
            ← 대시보드
          </Link>
          <h1 className="text-lg font-bold text-gray-900 mt-1">전체 정산서</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            오래된 정산서를 상태, 기간, 투어명/코드로 검색할 수 있습니다.
          </p>
        </div>
        <Link
          href="/guide/settlements/new"
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M7 2v10M2 7h10" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          새 작성
        </Link>
      </div>

      <form className="bg-white rounded-2xl border border-gray-100 p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-500">
            상태
            <select
              name="status"
              defaultValue={status}
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-800"
            >
              <option value="">전체</option>
              {GUIDE_HISTORY_STATUS_ORDER.map((v) => (
                <option key={v} value={v}>{STATUS_META[v].label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-500">
            기간
            <select
              name="period"
              defaultValue={period}
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-800"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-xs text-gray-500">
          검색
          <input
            type="search"
            name="search"
            defaultValue={search}
            placeholder="투어명 또는 투어코드"
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-800"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            조회
          </button>
          <Link
            href="/guide/settlements"
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 bg-white"
          >
            초기화
          </Link>
        </div>
      </form>

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">검색 결과</p>
        <span className="text-xs text-gray-400">
          {result.total}건 · {result.page}/{Math.max(result.totalPages, 1)}페이지
        </span>
      </div>

      {result.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-3xl mb-3">📋</p>
          <p className="text-gray-600 font-medium">조회 결과가 없습니다</p>
          <p className="text-sm text-gray-400 mt-1">필터를 바꾸거나 검색어를 지워보세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {result.items.map((s) => {
            const display = getSettlementStatusDisplay(s.status, s.guide_confirmed_at)
            const isEditable = ['draft', 'rejected', 'edit_requested'].includes(s.status)
            const href = settlementHref(s)
            return (
              <Link key={s.id} href={href}
                className="block bg-white rounded-2xl p-4 border border-gray-100 hover:border-gray-200 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{s.tour?.pattern}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{s.tour?.tour_code}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${display.bg} ${display.text}`}>
                    {display.label}
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

                {s.status === 'pending_guide_confirmation' && s.guide_confirmed_at == null && (
                  <p className="mt-2 text-xs text-orange-600">최종 확인 필요 →</p>
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

          {result.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              {page > 1 ? (
                <Link
                  href={buildGuideHistoryUrl({ ...listParams, page: page - 1 })}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
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
                  href={buildGuideHistoryUrl({ ...listParams, page: page + 1 })}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
                >
                  다음
                </Link>
              ) : (
                <span className="px-3 py-1.5 text-sm text-gray-300">다음</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
