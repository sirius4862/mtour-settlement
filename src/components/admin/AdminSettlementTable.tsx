import Link from 'next/link'
import { formatGuideDisplayLines } from '@/lib/guide/display-name'
import { formatRegionLabel } from '@/lib/region/regions'
import {
  formatAdminListUsd,
  parseSettlementCalcSummaryJson,
} from '@/lib/settlement/calc-summary'
import { canAdminEditSettlement, getSettlementStatusDisplay } from '@/types'
import type { AdminSettlementListItem } from '@/lib/admin/settlement-list'

function formatUpdatedAt(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ')
}

function StatusBadge({ s }: { s: AdminSettlementListItem }) {
  const display = getSettlementStatusDisplay(s.status, s.guide_confirmed_at)
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${display.bg} ${display.text}`}>
        {display.label}
      </span>
      {display.payReadyBadge && (
        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
          {display.payReadyBadge}
        </span>
      )}
    </div>
  )
}

export function AdminSettlementTable({ items }: { items: AdminSettlementListItem[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
            <th className="px-3 py-2.5 font-medium whitespace-nowrap">투어일</th>
            <th className="px-3 py-2.5 font-medium">투어명</th>
            <th className="px-3 py-2.5 font-medium whitespace-nowrap">투어코드</th>
            <th className="px-3 py-2.5 font-medium whitespace-nowrap">지역</th>
            <th className="px-3 py-2.5 font-medium whitespace-nowrap">가이드</th>
            <th className="px-3 py-2.5 font-medium whitespace-nowrap">상태</th>
            <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">회사입금</th>
            <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">지급액</th>
            <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">회사수익</th>
            <th className="px-3 py-2.5 font-medium whitespace-nowrap">수정일</th>
            <th className="px-3 py-2.5 font-medium whitespace-nowrap">작업</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => {
            const summary = parseSettlementCalcSummaryJson(s.calc_summary_json)
            const canEdit = canAdminEditSettlement(s.status)
            const guideLines = formatGuideDisplayLines(s.guide)
            return (
              <tr
                key={s.id}
                className="border-b border-gray-50 hover:bg-blue-50/40 transition-colors"
              >
                <td className="px-3 py-3 whitespace-nowrap text-gray-600">
                  {s.tour?.start_date ?? '—'}
                </td>
                <td className="px-3 py-3 min-w-[120px]">
                  <p
                    className="font-medium text-gray-800 truncate max-w-[200px]"
                    title={s.tour?.pattern ?? undefined}
                  >
                    {s.tour?.pattern ?? '—'}
                  </p>
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500 font-mono">
                  {s.tour?.tour_code ?? '—'}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-600">
                  {formatRegionLabel(s.branch?.code, s.branch?.name)}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-gray-600">
                  <p className="text-sm">{guideLines.primary}</p>
                  {guideLines.secondary && (
                    <p className="text-xs text-gray-400">{guideLines.secondary}</p>
                  )}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <StatusBadge s={s} />
                </td>
                <td className="px-3 py-3 text-right font-mono text-xs whitespace-nowrap">
                  {formatAdminListUsd(summary?.company_deposit_usd)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-xs whitespace-nowrap">
                  {formatAdminListUsd(summary?.guide_payout_usd)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-xs whitespace-nowrap text-gray-700">
                  {formatAdminListUsd(summary?.company_grand_total_usd)}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500">
                  {formatUpdatedAt(s.updated_at)}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/admin/settlements/${s.id}`}
                      className="px-2 py-1 text-xs font-medium text-blue-600 border border-blue-100 rounded-md hover:bg-blue-50"
                    >
                      상세
                    </Link>
                    {canEdit && (
                      <Link
                        href={`/admin/settlements/${s.id}/edit`}
                        className="px-2 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50"
                      >
                        수정
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function AdminSettlementQueueRow({ s }: { s: AdminSettlementListItem }) {
  const display = getSettlementStatusDisplay(s.status, s.guide_confirmed_at)
  const summary = parseSettlementCalcSummaryJson(s.calc_summary_json)
  const guideLines = formatGuideDisplayLines(s.guide)

  return (
    <Link
      href={`/admin/settlements/${s.id}`}
      className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-amber-100 hover:border-amber-200 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{s.tour?.pattern ?? '—'}</p>
        <p className="text-xs text-gray-400">
          {formatRegionLabel(s.branch?.code, s.branch?.name)} · {guideLines.primary}
          {guideLines.secondary ? ` (${guideLines.secondary})` : ''} · {s.tour?.start_date ?? s.year_month}
          {summary && (
            <span className="ml-2 font-mono">
              지급액 {formatAdminListUsd(summary.guide_payout_usd)}
            </span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${display.bg} ${display.text}`}>
          {display.label}
        </span>
        {display.payReadyBadge && (
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
            {display.payReadyBadge}
          </span>
        )}
      </div>
    </Link>
  )
}
