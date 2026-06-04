import Link from 'next/link'
import { requireGuide } from '@/lib/auth/session'
import { getAvailableTours, getMySettlements } from '@/lib/actions/settlementActions'
import { tourLabel } from '@/lib/settlement/mappers'
import { STATUS_META } from '@/types'

export const dynamic = 'force-dynamic'

export default async function GuidePage() {
  const session = await requireGuide()
  const [availableTours, settlements] = await Promise.all([
    getAvailableTours(),
    getMySettlements(),
  ])

  const draftSettlements = settlements.filter((s) => s.status === 'draft')
  const editRequested = settlements.filter((s) => s.status === 'edit_requested')
  const pendingConfirmation = settlements.filter(
    (s) => s.status === 'pending_guide_confirmation' && s.guide_confirmed_at == null,
  )

  const recent = settlements.slice(0, 3)

  return (
    <div className="px-4 py-5 space-y-5">
      <div>
        <p className="text-gray-500 text-sm">안녕하세요,</p>
        <h1 className="text-xl font-bold text-gray-900">{session.full_name}님</h1>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">배정된 투어</h2>
        {availableTours.length === 0 ? (
          <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 px-4 py-6 text-center">
            정산 가능한 투어가 없습니다.
            <br />
            <span className="text-xs">(90일 이내 · 미정산 투어만 표시)</span>
          </p>
        ) : (
          availableTours.map((t) => (
            <Link
              key={t.id}
              href="/guide/settlements/new"
              className="block bg-white rounded-xl border border-gray-100 px-4 py-3 hover:border-blue-200"
            >
              <p className="text-sm font-medium text-gray-800">{tourLabel(t)}</p>
              <p className="text-xs text-gray-500 mt-1">
                {t.agency_name} · {t.start_date} ~ {t.end_date} · {t.pax_count}명
              </p>
              <p className="text-xs text-blue-600 mt-2">정산서 작성 →</p>
            </Link>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">작성중</h2>
        {draftSettlements.length === 0 ? (
          <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 px-4 py-6 text-center">
            작성중인 정산서가 없습니다.
            <br />
            <span className="text-xs">임시저장한 정산서가 있을 때 표시됩니다.</span>
          </p>
        ) : (
          draftSettlements.map((s) => (
            <Link
              key={s.id}
              href={`/guide/settlements/${s.id}/edit`}
              className="block bg-white rounded-xl border border-gray-100 px-4 py-3 hover:border-blue-200"
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{s.tour?.pattern}</p>
                  <p className="text-xs text-gray-400 font-mono">{s.tour?.tour_code}</p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 shrink-0">
                  작성중
                </span>
              </div>
              <p className="text-xs text-blue-600 mt-2">이어 작성하기 →</p>
            </Link>
          ))
        )}
      </section>

      {editRequested.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-red-700">수정 필요</h2>
          {editRequested.map((s) => {
            const meta = STATUS_META[s.status]
            return (
              <Link
                key={s.id}
                href={`/guide/settlements/${s.id}/edit`}
                className="block bg-red-50 rounded-xl border border-red-100 px-4 py-3 hover:border-red-200"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{s.tour?.pattern}</p>
                    <p className="text-xs text-gray-400 font-mono">{s.tour?.tour_code}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${meta.bg} ${meta.text}`}>
                    {meta.label}
                  </span>
                </div>
                {s.reject_reason && (
                  <p className="text-xs text-red-600 mt-2 line-clamp-2">반려: {s.reject_reason}</p>
                )}
                <p className="text-xs text-blue-600 mt-2">수정하기 →</p>
              </Link>
            )
          })}
        </section>
      )}

      {pendingConfirmation.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-orange-700">최종 확인 필요</h2>
          {pendingConfirmation.map((s) => (
            <Link
              key={s.id}
              href={`/guide/settlements/${s.id}/confirm`}
              className="block bg-orange-50 rounded-xl border border-orange-100 px-4 py-3 hover:border-orange-200"
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{s.tour?.pattern}</p>
                  <p className="text-xs text-gray-400 font-mono">{s.tour?.tour_code}</p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 shrink-0">
                  확인 필요
                </span>
              </div>
              <p className="text-xs text-orange-600 mt-2">변경사항 확인 →</p>
            </Link>
          ))}
        </section>
      )}

      {recent.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">최근 정산서</h2>
            <Link href="/guide/settlements" className="text-xs text-blue-600">
              전체 정산서 보기
            </Link>
          </div>
          {recent.map((s) => {
            const meta = STATUS_META[s.status]
            const href =
              s.status === 'pending_guide_confirmation' && s.guide_confirmed_at == null
                ? `/guide/settlements/${s.id}/confirm`
                : s.status === 'draft' || s.status === 'rejected' || s.status === 'edit_requested'
                ? `/guide/settlements/${s.id}/edit`
                : `/guide/settlements/${s.id}`
            return (
              <Link
                key={s.id}
                href={href}
                className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-gray-100 hover:border-gray-200"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{s.tour?.pattern}</p>
                  <p className="text-xs text-gray-400 font-mono">{s.tour?.tour_code}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${meta.bg} ${meta.text}`}>
                  {meta.label}
                </span>
              </Link>
            )
          })}
        </section>
      )}
    </div>
  )
}
