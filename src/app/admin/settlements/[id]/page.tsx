import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SettlementAuditMatrix } from '@/components/settlement/sections/SettlementAuditMatrix'
import { SettlementBusinessSummary } from '@/components/settlement/sections/SettlementBusinessSummary'
import { Q75_NEGATIVE_WARNING } from '@/lib/settlement/display-labels'
import { requireAdmin } from '@/lib/auth/session'
import { canAdminAccessRegion } from '@/lib/region/permissions'
import {
  canMasterReopenPaid,
  isPostApprovalReadOnlyForAdmin,
  isAdmin,
} from '@/lib/auth/permissions'
import { getSettlementFull } from '@/lib/actions/settlementActions'
import { createClient } from '@/lib/supabase/server'
import { formatGuideDisplayLines } from '@/lib/guide/display-name'
import { formatRegionLabel } from '@/lib/region/regions'
import { calcSettlement } from '@/lib/settlement/calc'
import { formatUsd, formatVnd } from '@/lib/settlement/format-currency'
import { normalizeOtherAmountsFromDb } from '@/lib/settlement/other-expense-migrate'
import { stateFromSettlementFull, toCalcInput } from '@/lib/settlement/mappers'
import { STATUS_META, canAdminEditSettlement, canAdminOrMasterAdminEditSettlement, canAdminRequestEdit, canAdminSendForConfirmation, canMarkSettlementPaidForRole } from '@/types'
import { ReviewPanel } from './ReviewPanel'

export const dynamic = 'force-dynamic'

const fmt2 = formatUsd
const fmtV = formatVnd

export default async function AdminSettlementDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireAdmin()
  const data = await getSettlementFull(id)
  if (!data || !data.tour) notFound()

  if (
    !canAdminAccessRegion(
      { role: session.role, assignedRegionId: session.branch_id },
      data.branch_id,
    )
  ) {
    notFound()
  }

  const supabase = await createClient()
  const { data: guideProfile } = await supabase
    .from('profiles')
    .select('id, full_name, email, korean_name, vietnamese_name, branch_id')
    .eq('id', data.guide_id)
    .maybeSingle()

  const { tour, hotels, meals, entrances, others, shoppings, options } = data
  const s = data

  const { data: regionRow } = await supabase
    .from('branches')
    .select('id, name, code')
    .eq('id', s.branch_id)
    .maybeSingle()

  const guideLines = formatGuideDisplayLines(guideProfile)
  const meta = STATUS_META[s.status]

  const calc = calcSettlement(toCalcInput(stateFromSettlementFull(data, '')))
  const { sections, summary } = calc

  const companyDeposit = sections.cash.company_deposit_usd.value
  const q75IsNegative = companyDeposit < 0
  const guideSettlement = summary.guide_settlement_usd.value
  const guidePayout = summary.guide_payout_usd.value
  const companyProfit = summary.company_grand_total_usd.value
  const payoutIsFloored = guideSettlement < 0
  const settlementRatio = s.settlement_ratio ?? 0.5

  const isReadOnlyAdmin = isAdmin(session.role) && isPostApprovalReadOnlyForAdmin(s.status)
  const canSendForConfirmation = canAdminSendForConfirmation(s.status, session.role)
  const canAdminEdit = canAdminOrMasterAdminEditSettlement(s.status, session.role)
  const canReqEdit = canAdminRequestEdit(s.status, session.role)
  const canReopen  = canMasterReopenPaid(s.status, session.role)
  const canPay     = canMarkSettlementPaidForRole(session.role, s)

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
            <p>
              가이드: <strong>{guideLines.primary}</strong>
              {guideLines.secondary && (
                <span className="text-gray-500"> · {guideLines.secondary}</span>
              )}
            </p>
            <p>지역: <strong>{formatRegionLabel(regionRow?.code, regionRow?.name)}</strong></p>
            <p>{tour.agency_name}</p>
            <p>{tour.start_date} ~ {tour.end_date} ({tour.nights}박)</p>
            <p>{tour.pax_count}명 · 환율 {s.exchange_rate.toLocaleString()}동</p>
          </div>
        </div>
        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
          <p className="text-xs font-semibold text-amber-700 mb-2">정산 결과</p>
          <div className="space-y-1 text-xs">
            <p className={`${q75IsNegative ? 'text-red-700 font-semibold' : 'text-gray-600'}`}>
              회사입금 (Q75): <span className="font-mono">{fmt2(companyDeposit)}</span>
            </p>
            {q75IsNegative && (
              <p className="text-red-700 text-[10px]">{Q75_NEGATIVE_WARNING}</p>
            )}
            <p className="text-gray-600">
              가이드 수익풀 (D84): <span className="font-mono">{fmt2(summary.income_total_usd.value)}</span>
            </p>
            <p className="text-gray-600">
              회사 수익 합계: <span className="font-mono">{fmt2(summary.admin_income_usd.value)}</span>
            </p>
            <p className="text-gray-600">
              회사 지출 (H85): <span className="font-mono">{fmt2(summary.expense_total_usd.value)}</span>
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

      {/* 정산 요약 — business view + collapsed audit matrix */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-4">
        <p className="text-xs font-semibold text-gray-500">정산 요약</p>
        <SettlementBusinessSummary calc={calc} audience="admin" />
        <SettlementAuditMatrix calc={calc} settlementRatio={settlementRatio} />
      </div>

      {/* 항목 테이블들 */}
      {hotels.length > 0 && <ItemTable title="호텔비" rows={hotels.map(h => [
        h.hotel_name, h.check_in_date ?? '', fmt2(h.company_amount_usd), fmt2(h.guide_amount_usd)
      ])} headers={['호텔명', '날짜', '회사결제', '가이드결제']} />}

      {shoppings.length > 0 && <ItemTable title="쇼핑 수익" rows={shoppings.map(sh => [
        sh.shop_name, sh.visit_date ?? '', fmt2(sh.sale_usd), fmt2(sh.com_usd), fmt2(sh.kb_usd)
      ])} headers={['샵명', '날짜', 'SALE (참고)', 'COM (수익)', 'KB (회사 전용 수익)']} />}

      {options.length > 0 && <ItemTable title="옵션 수익" rows={options.map(op => [
        op.is_extra_vehicle ? '🚌 추가차량비' : op.option_name,
        op.option_date ?? '', fmt2(op.total_sale_usd), fmt2(op.expense_usd), fmtV(op.expense_vnd), fmt2(op.com_usd)
      ])} headers={['옵션명', '날짜', '판매총액', '지출$', '지출₫', 'COM']} />}

      {meals.length > 0 && <ItemTable title="식사비" rows={meals.map(m => [
        m.restaurant_name, m.meal_date ?? '', `${m.pax}명`, fmtV(m.amount_vnd)
      ])} headers={['식당명', '날짜', '인원', '금액(VND)']} />}

      {others.length > 0 && <ItemTable title="기타지출" rows={others.map(o => {
        const amounts = normalizeOtherAmountsFromDb(o)
        return [
          o.description || '—',
          fmt2(amounts.amount_usd),
          fmtV(amounts.amount_vnd),
          o.note?.trim() || '—',
        ]
      })} headers={['지출 항목', 'USD', 'VND', '메모']} />}

      {/* 메모 */}
      {s.guide_note && (
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <p className="text-xs font-semibold text-gray-500 mb-1">가이드 메모</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{s.guide_note}</p>
        </div>
      )}

      {isReadOnlyAdmin && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-700">
          <p className="font-semibold">조회 전용</p>
          <p className="text-xs text-gray-500 mt-1">
            최종확인 완료 또는 지급 완료된 정산서는 조회만 가능합니다. 승인·지급·수정은 마스터 관리자만 할 수 있습니다.
          </p>
        </div>
      )}

      {/* 관리자 검토 수정 */}
      {canAdminEdit && (
        <Link
          href={`/admin/settlements/${s.id}/edit`}
          className="block bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 hover:border-blue-200"
        >
          <p className="text-sm font-semibold text-blue-800">회사 전용 필드 수정</p>
          <p className="text-xs text-blue-600 mt-0.5">
            {canAdminEditSettlement(s.status)
              ? '지상비·호텔 단가·KB·추가차량·회사 지출 등 admin 필드 저장 →'
              : '가이드 재확인이 필요한 최종확인 완료 정산서 — 마스터 관리자만 수정 가능 →'}
          </p>
        </Link>
      )}

      {/* 관리자 액션 패널 */}
      {(canSendForConfirmation || canReqEdit || canPay || canReopen) && (
        <ReviewPanel
          settlementId={s.id}
          canSendForConfirmation={canSendForConfirmation}
          canRequestEdit={canReqEdit}
          canReopen={canReopen}
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
