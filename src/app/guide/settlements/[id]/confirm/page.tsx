import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireGuide } from '@/lib/auth/session'
import { getGuideConfirmationPacket } from '@/lib/actions/settlementActions'
import { GUIDE_FOOTER_LABELS } from '@/lib/settlement/display-labels'
import { ConfirmationDiffList } from '@/components/settlement/ConfirmationDiffList'
import { ConfirmPanel } from './ConfirmPanel'

export const dynamic = 'force-dynamic'

const fmt2 = (v: number | null) => {
  if (v == null || v === 0) return '—'
  return `$${v.toFixed(2)}`
}

export default async function GuideConfirmPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireGuide()
  const packet = await getGuideConfirmationPacket(id)

  if (!packet) {
    const { getSettlementFull } = await import('@/lib/actions/settlementActions')
    const full = await getSettlementFull(id, { audience: 'guide' })
    if (!full || full.guide_id !== session.id) notFound()
    // Desync: the guide is still prompted to confirm (pending, not yet confirmed) but no
    // usable pending packet exists. Do NOT silently redirect back to the detail page —
    // that creates a dead-end loop. Show a clear recovery message instead.
    if (full.status === 'pending_guide_confirmation' && full.guide_confirmed_at == null) {
      return <ConfirmUnavailable settlementId={id} tour={full.tour} />
    }
    // Already confirmed or moved on — detail page is the correct destination.
    redirect(`/guide/settlements/${id}`)
  }

  const {
    settlement: s,
    changes,
    companyDepositBefore,
    companyDepositAfter,
    guidePayoutBefore,
    guidePayoutAfter,
    adminNote,
  } = packet
  const { tour } = s

  return (
    <div className="px-4 py-5 pb-40 space-y-4">
      <div className="flex items-center gap-3">
        <Link href={`/guide/settlements/${id}`} className="text-gray-400 hover:text-gray-700">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.5 15L7.5 10l5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </Link>
        <div className="flex-1">
          <p className="font-semibold text-gray-800">{tour.pattern}</p>
          <p className="text-xs text-gray-400 font-mono">{tour.tour_code}</p>
        </div>
        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
          최종확인 대기
        </span>
      </div>

      <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
        <p className="text-sm font-semibold text-orange-800 mb-1">관리자 확인 요청</p>
        <p className="text-sm text-orange-700">
          관리자가 검토·수정한 내용을 확인해 주세요. 변경 사항에 동의하면 승인, 이의가 있으면 이의 요청을 선택하세요.
        </p>
      </div>

      {adminNote && (
        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          <p className="text-sm font-semibold text-blue-700 mb-1">관리자 메모</p>
          <p className="text-sm text-blue-600 whitespace-pre-wrap">{adminNote}</p>
        </div>
      )}

      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <p className="text-xs font-semibold text-gray-500 mb-3">정산 결과 요약</p>
        <div className="space-y-2 text-sm">
          <SummaryRow
            label={GUIDE_FOOTER_LABELS.companyDeposit}
            before={fmt2(companyDepositBefore)}
            after={fmt2(companyDepositAfter)}
            changed={companyDepositBefore !== companyDepositAfter}
          />
          <SummaryRow
            label={GUIDE_FOOTER_LABELS.guideSettlement}
            before={fmt2(guidePayoutBefore)}
            after={fmt2(guidePayoutAfter)}
            changed={guidePayoutBefore !== guidePayoutAfter}
          />
        </div>
      </div>

      <ConfirmationDiffList changes={changes} />

      <ConfirmPanel settlementId={id} />
    </div>
  )
}

function ConfirmUnavailable({
  settlementId,
  tour,
}: {
  settlementId: string
  tour: { pattern: string; tour_code: string }
}) {
  return (
    <div className="px-4 py-5 space-y-4">
      <div className="flex items-center gap-3">
        <Link href={`/guide/settlements/${settlementId}`} className="text-gray-400 hover:text-gray-700">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.5 15L7.5 10l5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </Link>
        <div className="flex-1">
          <p className="font-semibold text-gray-800">{tour.pattern}</p>
          <p className="text-xs text-gray-400 font-mono">{tour.tour_code}</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <p className="text-sm font-semibold text-amber-800 mb-1">확인 요청을 불러올 수 없습니다</p>
        <p className="text-sm text-amber-700">
          확인 요청 상태가 일치하지 않습니다. 관리자에게 재요청을 요청해 주세요.
        </p>
      </div>

      <Link
        href={`/guide/settlements/${settlementId}`}
        className="block text-center px-4 py-3 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50"
      >
        정산서로 돌아가기
      </Link>
    </div>
  )
}

function SummaryRow({
  label,
  before,
  after,
  changed,
}: {
  label: string
  before: string
  after: string
  changed: boolean
}) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0">
      <span className="text-gray-600">{label}</span>
      <div className="text-right text-xs">
        {changed ? (
          <>
            <span className="text-gray-400 font-mono">{before}</span>
            <span className="text-gray-300 mx-1">→</span>
            <span className="font-mono text-red-600 font-semibold">{after}</span>
          </>
        ) : (
          <span className="font-mono text-gray-800">{after}</span>
        )}
      </div>
    </div>
  )
}
