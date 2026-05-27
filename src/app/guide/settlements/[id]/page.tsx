import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireGuide } from '@/lib/auth/session'
import { getSettlementFull } from '@/lib/actions/settlementActions'
import { STATUS_META, canGuideEdit } from '@/types'
import { SubmitButton } from './SubmitButton'

export const dynamic = 'force-dynamic'

const fmt2 = (v: number) => v === 0 ? '—' : `$${v.toFixed(2)}`
const fmtV = (v: number) => v === 0 ? '—' : `₫${Math.round(v).toLocaleString('ko-KR')}`

export default async function SettlementDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireGuide()
  const data = await getSettlementFull(id)
  if (!data) notFound()

  const { settlement: s, tour, hotels, meals, entrances, others, shoppings, options } = data
  const meta = STATUS_META[s.status]
  const editable = canGuideEdit(s, session.id)
  const rate = s.exchange_rate

  // 간단 계산 (calcSettlement 함수 없이 기본 표시)
  const hotelCompany = hotels.reduce((a, h) => a + h.company_amount_usd, 0)
  const hotelGuide   = hotels.reduce((a, h) => a + h.guide_amount_usd, 0)
  const mealTotal    = meals.reduce((a, m) => a + m.amount_vnd, 0)
  const entrTotal    = entrances.reduce((a, e) => a + e.amount_vnd, 0)
  const otherUsd     = others.reduce((a, o) => a + o.amount_usd, 0)
  const otherVnd     = others.reduce((a, o) => a + o.amount_vnd, 0)
  const shopSale     = shoppings.reduce((a, s) => a + s.sale_usd, 0)
  const shopCom      = shoppings.reduce((a, s) => a + s.com_usd, 0)
  const shopKb       = shoppings.reduce((a, s) => a + s.kb_usd, 0)
  const optCom       = options.filter(o => !o.is_extra_vehicle).reduce((a, o) => a + o.com_usd, 0)
  const extraVehicle = options.filter(o => o.is_extra_vehicle)
    .reduce((a, o) => a + o.expense_usd + o.expense_vnd / rate, 0)

  // 수익 합계
  const incomeUsd = s.tour_fee_usd + shopSale + shopCom + optCom + s.tip_received_usd + s.charming_other_usd
  // 가이드지출
  const guideExpUsd = hotelGuide + (mealTotal + entrTotal + otherVnd) / rate + otherUsd + s.tc_guide_usd
  // 회사지출
  const compExpUsd  = hotelCompany + s.tc_company_usd
  // 기타포함
  const otherIncl   = s.vehicle_fee_usd + s.head_tax_usd + s.seoul_biz_fee_usd
  // 지출합계
  const totalExp    = guideExpUsd + compExpUsd + otherIncl
  // 회사총수익
  const compRevenue = incomeUsd - totalExp
  // 차액(밸런스)
  const balance     = (shopCom + optCom) - s.megugi_usd - (s.tc_guide_usd + s.tc_company_usd)
  // 가이드 정산
  const guideFinal  = balance * s.settlement_ratio + s.guide_daily_fee_usd
  // 회사수익
  const compFinal   = compRevenue - guideFinal
  // 최종회사총수익
  const compGrand   = compFinal + shopKb + extraVehicle

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
          ['정산비율', `${Math.round(s.settlement_ratio * 100)}%`],
        ]} />
      </Card>

      {/* 정산 요약 */}
      <Card title="정산 요약" accent>
        <div className="space-y-1.5 text-sm">
          <Row label="수익 합계" value={fmt2(incomeUsd)} bold />
          <Row label="지출 합계" value={fmt2(totalExp)} />
          <Row label="회사총수익" value={fmt2(compRevenue)} />
          <div className="border-t border-blue-200 pt-1.5 mt-1.5 space-y-1">
            <Row label={`가이드 정산 (${Math.round(s.settlement_ratio * 100)}%)`} value={fmt2(guideFinal)} bold accent />
            <Row label="회사 수익" value={fmt2(compFinal)} />
            <Row label="최종 회사총수익" value={fmt2(compGrand)} />
          </div>
        </div>
      </Card>

      {/* 전도금 / 수익 직접입력 */}
      <Card title="수익 직접입력">
        <div className="space-y-1">
          {[
            ['전도금', fmtV(s.advance_vnd), `≈ ${fmt2(s.advance_vnd / rate)}`],
            ['투어피', fmt2(s.tour_fee_usd), ''],
            ['차밍쇼/기타', fmt2(s.charming_other_usd), ''],
            ['받은팁', fmt2(s.tip_received_usd), ''],
            ['옵션외상/팁송금', fmt2(s.option_credit_usd), ''],
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
                <span>KB: {fmt2(sh.kb_usd)}</span>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* 옵션 */}
      {options.length > 0 && (
        <Card title={`옵션 수익 (${options.length}건)`}>
          {options.map((op, i) => (
            <div key={op.id} className="py-1.5 border-b border-gray-50 last:border-0">
              <div className="flex justify-between">
                <span className="text-sm text-gray-700">
                  {op.is_extra_vehicle ? '🚌 추가차량비' : op.option_name || `옵션 ${i+1}`}
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
                <p>회사: {fmt2(h.company_amount_usd)}</p>
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
          {others.map(o => (
            <div key={o.id} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-sm text-gray-700">{o.description || '기타'}</span>
              <div className="text-right text-xs font-mono text-gray-700">
                {o.amount_usd > 0 && <p>{fmt2(o.amount_usd)}</p>}
                {o.amount_vnd > 0 && <p>{fmtV(o.amount_vnd)}</p>}
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* 메모 */}
      {s.guide_note && (
        <Card title="가이드 메모">
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{s.guide_note}</p>
        </Card>
      )}
      {s.admin_note && (
        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          <p className="text-sm font-semibold text-blue-700 mb-1">관리자 메모</p>
          <p className="text-sm text-blue-600 whitespace-pre-wrap">{s.admin_note}</p>
        </div>
      )}

      {/* 하단 버튼 */}
      {editable && (
        <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 max-w-lg mx-auto">
          <div className="flex gap-2">
            <Link href={`/guide/settlements/new?edit=${s.id}`}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 text-center hover:bg-gray-50">
              수정하기
            </Link>
            <SubmitButton settlementId={s.id} />
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
