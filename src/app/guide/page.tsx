import Link from 'next/link'
import { requireGuide } from '@/lib/auth/session'
import { getAvailableTours, getMySettlements } from '@/lib/actions/settlementActions'
import { tourLabel } from '@/lib/settlement/mappers'
import { STATUS_META, type SettlementStatus } from '@/types'

export const dynamic = 'force-dynamic'

const ACTION_STATUSES: SettlementStatus[] = ['rejected', 'edit_requested', 'draft']

export default async function GuidePage() {
  const session = await requireGuide()
  const [availableTours, settlements] = await Promise.all([
    getAvailableTours(),
    getMySettlements(),
  ])

  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const thisMonth = settlements.filter((s) => s.year_month === ym)

  const counts = {
    draft: thisMonth.filter((s) => s.status === 'draft').length,
    submitted: thisMonth.filter((s) => s.status === 'submitted').length,
    approved: thisMonth.filter((s) => ['approved', 'paid'].includes(s.status)).length,
  }

  const needingAction = settlements.filter((s) => ACTION_STATUSES.includes(s.status))
  const rejectedOrEdit = settlements.filter((s) =>
    s.status === 'rejected' || s.status === 'edit_requested',
  )
  const recent = settlements.slice(0, 5)

  return (
    <div className="px-4 py-5 space-y-5">
      <div>
        <p className="text-gray-500 text-sm">안녕하세요,</p>
        <h1 className="text-xl font-bold text-gray-900">{session.full_name} 가이드님</h1>
      </div>

      <div className="bg-blue-600 rounded-2xl p-5 text-white">
        <p className="text-blue-200 text-sm mb-3">{ym} 정산 현황</p>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: '작성중', value: counts.draft, color: 'text-blue-200' },
            { label: '검토중', value: counts.submitted, color: 'text-amber-300' },
            { label: '완료', value: counts.approved, color: 'text-emerald-300' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-blue-300 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {rejectedOrEdit.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-red-700">수정 필요</h2>
          {rejectedOrEdit.map((s) => {
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

      {needingAction.filter((s) => s.status === 'draft').length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">작성 중</h2>
          {needingAction
            .filter((s) => s.status === 'draft')
            .map((s) => (
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
                <p className="text-xs text-blue-600 mt-2">계속 작성 →</p>
              </Link>
            ))}
        </section>
      )}

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

      {recent.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">최근 정산서</h2>
            <Link href="/guide/settlements" className="text-xs text-blue-600">
              전체 보기
            </Link>
          </div>
          {recent.map((s) => {
            const meta = STATUS_META[s.status]
            const href =
              s.status === 'draft' || s.status === 'rejected' || s.status === 'edit_requested'
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
