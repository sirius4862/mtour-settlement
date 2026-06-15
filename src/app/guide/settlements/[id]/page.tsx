import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireGuide } from '@/lib/auth/session'
import { getSettlementFullForGuide } from '@/lib/actions/settlementActions'
import { calcSettlement } from '@/lib/settlement/calc'
import { GUIDE_FOOTER_LABELS, GUIDE_PAYOUT_FLOOR_WARNING, Q75_NEGATIVE_WARNING } from '@/lib/settlement/display-labels'
import { formatUsd, formatVnd } from '@/lib/settlement/format-currency'
import { normalizeOtherAmountsFromDb } from '@/lib/settlement/other-expense-migrate'
import { stateFromSettlementFull, toCalcInput } from '@/lib/settlement/mappers'
import { normalizeExternalReceivableForForm } from '@/lib/settlement/external-receivable'
import { correctionReasonForDisplay } from '@/lib/settlement/correction-request-meta'
import { STATUS_META, canGuideEdit, canGuideConfirm } from '@/types'
export const dynamic = 'force-dynamic'

const fmt2 = formatUsd
const fmtV = formatVnd

export default async function SettlementDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireGuide()
  const data = await getSettlementFullForGuide(id)
  if (!data || !data.tour) notFound()
  if (session.role === 'guide' && data.guide_id !== session.id) notFound()

  const { tour, hotels, meals, entrances, others, shoppings, options } = data
  const s = data
  const meta = STATUS_META[s.status]
  const editable = canGuideEdit(s, session.id)
  const needsConfirm = canGuideConfirm(s, session.id)
  const guideConfirmComplete =
    s.guide_id === session.id &&
    s.status === 'pending_guide_confirmation' &&
    s.guide_confirmed_at != null
  const rate = s.exchange_rate

  const calc = calcSettlement(toCalcInput(stateFromSettlementFull(data, '')))
  const receivable = normalizeExternalReceivableForForm(s)
  const companyDeposit = calc.sections.cash.company_deposit_usd.value
  const guidePayout = calc.summary.guide_payout_usd.value
  const payoutIsFloored = calc.summary.guide_settlement_usd.value < 0

  return (
    <div className="px-4 py-5 pb-32 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/guide/settlements" className="text-gray-400 hover:text-gray-700">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.5 15L7.5 10l5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </Link>
        <div className="flex-1">
          <p className="font-semibold text-gray-800">{tour.pattern}</p>
          <p className="text-xs text-gray-400 font-mono">{tour.tour_code}</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${meta.bg} ${meta.text}`}>
          {meta.label}
        </span>
      </div>

      {needsConfirm && (
        <Link
          href={`/guide/settlements/${s.id}/confirm`}
          className="block bg-orange-50 border border-orange-200 rounded-xl p-4 hover:border-orange-300"
        >
          <p className="text-sm font-semibold text-orange-800 mb-1">관리자 확인 요청</p>
          <p className="text-sm text-orange-700">변경된 정산 내용을 확인하고 이상없음을 선택해 주세요.</p>
          <p className="text-xs text-orange-600 mt-2 font-medium">변경사항 확인 →</p>
        </Link>
      )}

      {guideConfirmComplete && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-emerald-800 mb-1">확인 완료</p>
          <p className="text-sm text-emerald-700">관리자 지급완료 처리를 기다리는 중입니다.</p>
        </div>
      )}

      {s.status === 'clarification_requested' && s.clarification_message && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-rose-700 mb-1">이의 요청 접수됨</p>
          <p className="text-sm text-rose-600">{s.clarification_message}</p>
          <p className="text-xs text-gray-500 mt-2">관리자 검토 후 다시 연락드립니다.</p>
        </div>
      )}

      {/* 반려 사유 */}
      {s.reject_reason && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-700 mb-1">반려 사유</p>
          <p className="text-sm text-red-600">{s.reject_reason}</p>
        </div>
      )}

      {/* 투어 정보 */}
      <Card title="투어 정보">
        <InfoGrid items={[
          ['여행사', tour.agency_name], ['기간', `${tour.start_date} ~ ${tour.end_date}`],
          ['인원', `${tour.pax_count}명`], ['박수', `${tour.nights}박`],
          ['환율', `${s.exchange_rate.toLocaleString()}동/달러`],
        ]} />
      </Card>

      {/* 정산 요약 */}
      <Card title="정산 요약" accent>
        <div className="space-y-1.5 text-sm">
          <Row label={GUIDE_FOOTER_LABELS.companyDeposit} value={fmt2(companyDeposit)} />
          {companyDeposit < 0 && (
            <p className="text-xs text-red-700 pt-1">{Q75_NEGATIVE_WARNING}</p>
          )}
          <Row label={GUIDE_FOOTER_LABELS.guideSettlement} value={fmt2(guidePayout)} bold accent />
          {payoutIsFloored && (
            <p className="text-xs text-amber-700 pt-1">
              {GUIDE_PAYOUT_FLOOR_WARNING}
            </p>
          )}
        </div>
      </Card>

      {/* 전도금 / 수익 직접입력 */}
      <Card title="수익 직접입력">
        <div className="space-y-1">
          {[
            ['전도금', fmtV(s.advance_vnd), `≈ ${fmt2(s.advance_vnd / rate)}`],
            ['차밍쇼/기타', fmt2(s.charming_other_usd), ''],
            ['받은팁', fmt2(s.tip_received_usd), ''],
            ['옵션외상', fmt2(receivable.option_receivable_usd), ''],
            ['팁송금', fmt2(receivable.tip_transfer_usd), ''],
          ].map(([l, v, sub]) => (
            <div key={l as string} className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0">
              <span className="text-xs text-gray-600">{l}</span>
              <div className="text-right">
                <span className="text-xs font-mono text-gray-800">{v}</span>
                {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 쇼핑 */}
      {shoppings.length > 0 && (
        <Card title={`쇼핑 수익 (${shoppings.length}건)`}>
          {shoppings.map((sh, i) => (
            <div key={sh.id} className="py-1.5 border-b border-gray-50 last:border-0">
              <div className="flex justify-between">
                <span className="text-sm text-gray-700">{sh.shop_name || `쇼핑 ${i+1}`}</span>
                <span className="text-xs text-gray-400">{sh.visit_date ?? ''}</span>
              </div>
              <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                <span>SALE: {fmt2(sh.sale_usd)}</span>
                <span>COM: {fmt2(sh.com_usd)}</span>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* 옵션 */}
      {options.filter((o) => !o.is_extra_vehicle).length > 0 && (
        <Card title={`옵션 수익 (${options.filter((o) => !o.is_extra_vehicle).length}건)`}>
          {options.filter((o) => !o.is_extra_vehicle).map((op, i) => (
            <div key={op.id} className="py-1.5 border-b border-gray-50 last:border-0">
              <div className="flex justify-between">
                <span className="text-sm text-gray-700">
                  {op.option_name || `옵션 ${i + 1}`}
                </span>
                <span className="text-xs font-mono text-gray-700">COM: {fmt2(op.com_usd)}</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {fmt2(op.total_sale_usd)} - {fmt2(op.expense_usd)} - {fmtV(op.expense_vnd)}
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* 호텔 */}
      {hotels.length > 0 && (
        <Card title={`호텔비 (${hotels.length}건)`}>
          {hotels.map(h => (
            <div key={h.id} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
              <div>
                <span className="text-sm text-gray-700">{h.hotel_name || '호텔'}</span>
                <p className="text-xs text-gray-400">{h.check_in_date} · {h.nights}박</p>
              </div>
              <div className="text-right text-xs text-gray-600">
                <p>가이드: {fmt2(h.guide_amount_usd)}</p>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* 식사비 */}
      {meals.length > 0 && (
        <Card title={`식사비 (${meals.length}건)`}>
          {meals.map(m => (
            <div key={m.id} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-sm text-gray-700">{m.restaurant_name || '식사'}</span>
              <span className="text-xs font-mono text-gray-700">{fmtV(m.amount_vnd)}</span>
            </div>
          ))}
        </Card>
      )}

      {/* 입장료 */}
      {entrances.length > 0 && (
        <Card title={`입장료 (${entrances.length}건)`}>
          {entrances.map(e => (
            <div key={e.id} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-sm text-gray-700">{e.attraction_name || '입장료'}</span>
              <span className="text-xs font-mono text-gray-700">{fmtV(e.amount_vnd)}</span>
            </div>
          ))}
        </Card>
      )}

      {/* 기타지출 */}
      {others.length > 0 && (
        <Card title={`기타지출 (${others.length}건)`}>
          {others.map(o => {
            const amounts = normalizeOtherAmountsFromDb(o)
            return (
            <div key={o.id} className="py-2 border-b border-gray-50 last:border-0 space-y-0.5">
              <div className="flex justify-between gap-3">
                <span className="text-sm text-gray-800">{o.description || '기타'}</span>
                <div className="text-right text-xs font-mono text-gray-700 shrink-0">
                  {amounts.amount_usd > 0 && <p>{fmt2(amounts.amount_usd)}</p>}
                  {amounts.amount_vnd > 0 && <p>{fmtV(amounts.amount_vnd)}</p>}
                </div>
              </div>
              {o.note?.trim() && (
                <p className="text-xs text-gray-500">{o.note}</p>
              )}
            </div>
            )
          })}
        </Card>
      )}

      {/* 메모 */}
      {s.guide_note && (
        <Card title="가이드 메모">
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{s.guide_note}</p>
        </Card>
      )}
      {correctionReasonForDisplay(s.admin_note) && (
        <div className="bg-red-50 rounded-2xl p-4 border border-red-100">
          <p className="text-sm font-semibold text-red-800 mb-1">관리자 수정 요청</p>
          <p className="text-sm text-red-700 whitespace-pre-wrap">
            {correctionReasonForDisplay(s.admin_note)}
          </p>
        </div>
      )}

      {/* 하단 버튼 */}
      {editable && (
        <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 max-w-lg mx-auto">
          <div className="flex gap-2">
            <Link
              href={`/guide/settlements/${s.id}/edit`}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 text-center hover:bg-gray-50"
            >
              수정하기
            </Link>
            <Link
              href={`/guide/settlements/${s.id}/edit`}
              className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold text-center hover:bg-blue-700"
            >
              저장 후 제출
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 재사용 컴포넌트 ──────────────────────────────────────────

function Card({ title, children, accent }: { title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 border ${accent ? 'bg-blue-50 border-blue-100' : 'bg-white border-gray-100'}`}>
      <h2 className={`text-sm font-semibold mb-3 ${accent ? 'text-blue-800' : 'text-gray-700'}`}>{title}</h2>
      {children}
    </div>
  )
}

function InfoGrid({ items }: { items: [string, string][] }) {
  return (
    <div className="grid grid-cols-2 gap-y-2 text-xs">
      {items.map(([label, val]) => (
        <div key={label}>
          <span className="text-gray-400">{label}: </span>
          <span className="text-gray-700">{val}</span>
        </div>
      ))}
    </div>
  )
}

function Row({ label, value, bold, accent }: {
  label: string; value: string; bold?: boolean; accent?: boolean
}) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${accent ? 'text-blue-700' : 'text-gray-600'}`}>{label}</span>
      <span className={`font-mono text-sm ${bold ? (accent ? 'text-blue-900 font-bold' : 'text-gray-900 font-semibold') : 'text-gray-700'}`}>
        {value}
      </span>
    </div>
  )
}
