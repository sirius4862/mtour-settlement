import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/session'
import { getSettlementFull } from '@/lib/actions/settlementActions'
import { createClient } from '@/lib/supabase/server'
import { formatGuideDisplayName } from '@/lib/guide/display-name'
import { calcSettlement } from '@/lib/settlement/calc'
import { stateFromSettlementFull, toCalcInput } from '@/lib/settlement/mappers'
import { STATUS_META, canAdminEditSettlement, canAdminPaySettlement, canAdminReject, canAdminRequestEdit, canAdminSendForConfirmation } from '@/types'
import { ReviewPanel } from './ReviewPanel'

export const dynamic = 'force-dynamic'

const fmt2 = (v: number) => v === 0 ? '—' : `$${v.toFixed(2)}`
const fmtV = (v: number) => v === 0 ? '—' : `₫${Math.round(v).toLocaleString('ko-KR')}`

export default async function AdminSettlementDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireAdmin()
  const data = await getSettlementFull(id)
  if (!data) notFound()

  const supabase = await createClient()
  const { data: guideProfile } = await supabase
    .from('profiles')
    .select('id, full_name, email, korean_name, vietnamese_name')
    .eq('id', data.guide_id)
    .maybeSingle()

  const { tour, hotels, meals, entrances, others, shoppings, options } = data
  const s = data
  const meta = STATUS_META[s.status]

  const calc = calcSettlement(toCalcInput(stateFromSettlementFull(data, '')))
  const { sections, summary, matrix } = calc
  const m = (key: string) => matrix.find((r) => r.key === key)

  const companyDeposit = sections.cash.company_deposit_usd.value
  const guideSettlement = summary.guide_settlement_usd.value
  const guidePayout = summary.guide_payout_usd.value
  const companyProfit = summary.company_grand_total_usd.value
  const payoutIsFloored = guideSettlement < 0

  const canSendForConfirmation = canAdminSendForConfirmation(s.status)
  const canAdminEdit = canAdminEditSettlement(s.status)
  const canReqEdit = canAdminRequestEdit(s.status)
  const canReject  = canAdminReject(s.status)
  const canPay     = canAdminPaySettlement(s)

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-32">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/admin/settlements" className="text-gray-400 hover:text-gray-700">
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

      {/* 투어 + 정산 요약 나란히 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <p className="text-xs font-semibold text-gray-500 mb-2">투어 정보</p>
          <div className="space-y-1 text-xs text-gray-600">
            <p>가이드: <strong>{formatGuideDisplayName(guideProfile)}</strong></p>
            <p>{tour.agency_name}</p>
            <p>{tour.start_date} ~ {tour.end_date} ({tour.nights}박)</p>
            <p>{tour.pax_count}명 · 환율 {s.exchange_rate.toLocaleString()}동</p>
          </div>
        </div>
        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
          <p className="text-xs font-semibold text-amber-700 mb-2">정산 결과</p>
          <div className="space-y-1 text-xs">
            <p className="text-gray-600">
              회사입금 (Q75): <span className="font-mono">{fmt2(companyDeposit)}</span>
            </p>
            <p className="text-gray-600">
              수익 (D84): <span className="font-mono">{fmt2(summary.income_total_usd.value)}</span>
            </p>
            <p className="text-gray-600">
              지출 (H85): <span className="font-mono">{fmt2(summary.expense_total_usd.value)}</span>
            </p>
            <p className={`font-semibold ${payoutIsFloored ? 'text-red-700' : 'text-amber-700'}`}>
              계산상 가이드정산 (R85): <span className="font-mono">{fmt2(guideSettlement)}</span>
            </p>
            <p className="text-amber-700 font-semibold">
              실제 지급액 (P85): <span className="font-mono">{fmt2(guidePayout)}</span>
            </p>
            {payoutIsFloored && (
              <p className="text-amber-700 text-[10px]">
                가이드 정산금액이 마이너스라 지급액은 $0으로 처리됩니다.
              </p>
            )}
            <p className="text-emerald-700 font-semibold">
              회사수익 (R87): <span className="font-mono">{fmt2(companyProfit)}</span>
            </p>
          </div>
        </div>
      </div>

      {/* 상세 계산표 — calcSettlement 단일 소스 */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <p className="text-xs font-semibold text-gray-500 mb-3">상세 계산 (엑셀 R77-R87)</p>
        <div className="space-y-1.5 text-xs">
          {[
            ['투어피 (D79)', fmt2(m('r79')?.income?.value ?? 0)],
            ['쇼핑수익 D72+SUM(F72) (D80)', fmt2(m('r80')?.income?.value ?? 0)],
            ['옵션수익 S72 (D81)', fmt2(m('r81')?.income?.value ?? 0)],
            ['받은팁 (D82)', fmt2(m('r82')?.income?.value ?? 0)],
            ['추가수익 (D83)', fmt2(m('r83')?.income?.value ?? 0)],
            ['─ 수익합계 (D84)', fmt2(summary.income_total_usd.value), true],
            ['호텔 가이드 (H79)', fmt2(m('r79')?.guideExpense?.value ?? 0)],
            ['식사비 환산 (H80)', fmt2(m('r80')?.guideExpense?.value ?? 0)],
            ['입장료 환산 (H81)', fmt2(m('r81')?.guideExpense?.value ?? 0)],
            ['기타지출 (H82)', fmt2(m('r82')?.guideExpense?.value ?? 0)],
            ['T/C 가이드 (H83)', fmt2(m('r83')?.guideExpense?.value ?? 0)],
            ['T/C 회사 (J83)', fmt2(m('r83')?.companyExpense?.value ?? 0)],
            ['기타포함 SUM(O79:O83) (O84)', fmt2(m('r84')?.included?.value ?? 0)],
            ['─ 지출합계 H84+J84+M84+O84 (H85)', fmt2(summary.expense_total_usd.value), true],
            ['─ 수익−지출 (F86)', fmt2(summary.company_gross_usd.value), true],
            ['정산풀 D80+D81 (R79)', fmt2(m('r79')?.settlement?.value ?? 0)],
            ['메꾸기 (R80)', `- ${fmt2(m('r80')?.settlement?.value ?? 0)}`],
            ['T/C정산공제 H83+J83 (R81)', `- ${fmt2(m('r81')?.settlement?.value ?? 0)}`],
            ['─ 차액밸런스 R79−R80−R81 (R84)', fmt2(summary.balance_usd.value), true],
            ['가이드일비 (R82)', fmt2(m('r82')?.settlement?.value ?? 0)],
            [`─ 계산상 가이드정산 R84×${Math.round(s.settlement_ratio * 100)}%+R82 (R85)`, fmt2(guideSettlement), true, true],
            ...(payoutIsFloored
              ? [['─ 실제 지급액 MAX(R85,0) (P85)', fmt2(guidePayout), true] as const]
              : []),
            ['─ R86 중간값', fmt2(summary.company_profit_usd.value), true],
            ['KB합계 (H72)', fmt2(sections.shopping.kb_usd.value)],
            ['추가차량비 (S75)', fmt2(sections.options.extra_vehicle_usd.value)],
            ['─ 회사수익 R86+H72+S75 (R87)', fmt2(companyProfit), true],
            ['회사입금 J75−N75−P75 (Q75)', fmt2(companyDeposit)],
          ].map(([l, v, bold, accent]) => (
            <div key={l as string} className={`flex justify-between py-1 ${bold ? 'border-t border-gray-100 mt-1 pt-1.5' : ''}`}>
              <span className={`${accent ? 'text-amber-700 font-semibold' : bold ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                {l}
              </span>
              <span className={`font-mono ${accent ? 'text-amber-800 font-bold' : bold ? 'text-gray-900 font-semibold' : 'text-gray-700'}`}>
                {v}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 항목 테이블들 */}
      {hotels.length > 0 && <ItemTable title="호텔비" rows={hotels.map(h => [
        h.hotel_name, h.check_in_date ?? '', fmt2(h.company_amount_usd), fmt2(h.guide_amount_usd)
      ])} headers={['호텔명', '날짜', '회사결제', '가이드결제']} />}

      {shoppings.length > 0 && <ItemTable title="쇼핑 수익" rows={shoppings.map(sh => [
        sh.shop_name, sh.visit_date ?? '', fmt2(sh.sale_usd), fmt2(sh.com_usd), fmt2(sh.kb_usd)
      ])} headers={['샵명', '날짜', 'SALE', 'COM', 'KB']} />}

      {options.length > 0 && <ItemTable title="옵션 수익" rows={options.map(op => [
        op.is_extra_vehicle ? '🚌 추가차량비' : op.option_name,
        op.option_date ?? '', fmt2(op.total_sale_usd), fmt2(op.expense_usd), fmtV(op.expense_vnd), fmt2(op.com_usd)
      ])} headers={['옵션명', '날짜', '판매총액', '지출$', '지출₫', 'COM']} />}

      {meals.length > 0 && <ItemTable title="식사비" rows={meals.map(m => [
        m.restaurant_name, m.meal_date ?? '', `${m.pax}명`, fmtV(m.amount_vnd)
      ])} headers={['식당명', '날짜', '인원', '금액(VND)']} />}

      {/* 메모 */}
      {s.guide_note && (
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <p className="text-xs font-semibold text-gray-500 mb-1">가이드 메모</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{s.guide_note}</p>
        </div>
      )}

      {/* 관리자 검토 수정 */}
      {canAdminEdit && (
        <Link
          href={`/admin/settlements/${s.id}/edit`}
          className="block bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 hover:border-blue-200"
        >
          <p className="text-sm font-semibold text-blue-800">회사 전용 필드 수정</p>
          <p className="text-xs text-blue-600 mt-0.5">지상비·호텔 단가·KB·추가차량 등 admin 필드 저장 →</p>
        </Link>
      )}

      {/* 관리자 액션 패널 */}
      {(canSendForConfirmation || canReject || canReqEdit || canPay) && (
        <ReviewPanel
          settlementId={s.id}
          canSendForConfirmation={canSendForConfirmation}
          canReject={canReject}
          canRequestEdit={canReqEdit}
          canPay={canPay}
          currentAdminNote={s.admin_note ?? ''}
        />
      )}
    </div>
  )
}

function ItemTable({ title, headers, rows }: {
  title: string; headers: string[]; rows: string[][]
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50">
        <p className="text-xs font-semibold text-gray-600">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>{headers.map(h => <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-gray-50">
                {row.map((cell, j) => <td key={j} className="px-3 py-2 text-gray-700 whitespace-nowrap font-mono">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
