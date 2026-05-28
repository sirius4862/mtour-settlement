'use client'

import type { AnnotatedNumber, SettlementCalcResult, SettlementMatrixRow } from '@/lib/settlement/types-calc'
import { CalculatedField, formatUsd } from '../CalculatedField'

function ValueCell({ field, highlight }: { field?: AnnotatedNumber; highlight?: boolean }) {
  if (!field) return <span className="text-gray-300">—</span>
  return (
    <div className={highlight ? 'text-amber-900 font-bold' : ''}>
      <div className="font-mono text-sm">{formatUsd(field.value)}</div>
      <div className="text-[9px] font-mono text-gray-400">{field.excelRef}</div>
    </div>
  )
}

function MatrixRowView({ row }: { row: SettlementMatrixRow }) {
  return (
    <div
      className={
        'grid grid-cols-5 gap-1 px-2 py-2 border-t border-gray-100 min-w-[640px] ' +
        (row.isSubtotal ? 'bg-slate-50' : '') +
        (row.isHighlight ? ' bg-amber-50/90' : '')
      }
    >
      <div className="min-w-0">
        {row.incomeLabel && <div className="text-[10px] text-gray-500 mb-0.5">{row.incomeLabel}</div>}
        <ValueCell field={row.income} highlight={row.isHighlight} />
      </div>
      <div className="min-w-0">
        {row.expenseLabel && <div className="text-[10px] text-gray-500 mb-0.5">{row.expenseLabel}</div>}
        <ValueCell field={row.guideExpense} />
      </div>
      <div className="min-w-0">
        <ValueCell field={row.companyExpense} />
      </div>
      <div className="min-w-0">
        {row.includedLabel && <div className="text-[10px] text-gray-500 mb-0.5">{row.includedLabel}</div>}
        <ValueCell field={row.included} />
      </div>
      <div className="min-w-0">
        {row.settlementLabel && <div className="text-[10px] text-gray-500 mb-0.5">{row.settlementLabel}</div>}
        <ValueCell field={row.settlement} highlight={row.isHighlight} />
      </div>
    </div>
  )
}

export function FinalSummarySection({
  calc,
  settlementRatio,
}: {
  calc: SettlementCalcResult
  settlementRatio: number
}) {
  const { matrix, summary } = calc

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <CalculatedField field={summary.income_total_usd} />
        <CalculatedField field={summary.expense_total_usd} />
      </div>

      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-xs font-semibold text-gray-600">정산내역 매트릭스</span>
        <span className="text-[10px] font-mono px-2 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-100">
          R77 = {Math.round(settlementRatio * 100)}%
        </span>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto no-scrollbar">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-5 gap-1 px-2 py-2 bg-gray-50 text-[10px] font-medium text-gray-500 uppercase tracking-wide">
              <div>수익 (D)</div>
              <div>가이드지출 (H)</div>
              <div>회사지출 (J)</div>
              <div>기타포함 (O)</div>
              <div>정산 (R/P)</div>
            </div>
            {matrix.map((row) => (
              <MatrixRowView key={row.key} row={row} />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="rounded-2xl bg-amber-50 border-2 border-amber-200 p-4">
          <CalculatedField field={summary.guide_settlement_usd} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <CalculatedField field={summary.company_profit_usd} compact />
          <CalculatedField field={summary.company_grand_total_usd} compact />
        </div>
        <CalculatedField field={summary.balance_usd} compact />
        <CalculatedField field={summary.company_gross_usd} compact />
      </div>
    </div>
  )
}
