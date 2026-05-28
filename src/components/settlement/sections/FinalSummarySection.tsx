'use client'

import type { AnnotatedNumber, SettlementCalcResult, SettlementMatrixRow } from '@/lib/settlement/types-calc'
import { CalculatedField, formatUsd } from '../CalculatedField'
import { SectionHint } from '../SectionHint'
import { EXCEL_SECTIONS } from '@/lib/settlement/excel-sections'

const COL_HEADERS = [
  { key: 'd', label: '수익', ref: 'D', sub: 'Tour fee, shopping, tips…' },
  { key: 'h', label: '가이드지출', ref: 'H', sub: 'Hotel, meals, TC…' },
  { key: 'j', label: '회사지출', ref: 'J', sub: 'Company hotel, TC…' },
  { key: 'o', label: '기타포함', ref: 'O', sub: 'Vehicle, taxes…' },
  { key: 'r', label: '정산', ref: 'R', sub: 'Balance, guide pay…' },
] as const

function MatrixCell({
  field,
  highlight,
  empty = '—',
}: {
  field?: AnnotatedNumber
  highlight?: boolean
  empty?: string
}) {
  if (!field) {
    return <span className="text-gray-200 text-sm">{empty}</span>
  }
  return (
    <div className={highlight ? 'text-amber-900' : ''}>
      <div className={`font-mono text-sm tabular-nums ${highlight ? 'font-bold' : 'font-semibold text-gray-900'}`}>
        {formatUsd(field.value)}
      </div>
      <div className="text-[9px] font-mono text-blue-600/80">{field.excelRef}</div>
    </div>
  )
}

function MatrixRowMobile({ row }: { row: SettlementMatrixRow }) {
  const cells = [
    { label: row.incomeLabel, field: row.income },
    { label: row.expenseLabel, field: row.guideExpense },
    { label: '회사지출', field: row.companyExpense },
    { label: row.includedLabel, field: row.included },
    { label: row.settlementLabel, field: row.settlement },
  ].filter((c) => c.label || c.field)

  return (
    <div
      className={
        'rounded-xl border p-3 space-y-2 ' +
        (row.isHighlight ? 'border-amber-300 bg-amber-50/80' : row.isSubtotal ? 'border-slate-200 bg-slate-50' : 'border-gray-100 bg-white')
      }
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-bold text-gray-500 uppercase">{row.key.toUpperCase()}</span>
        {row.isSubtotal && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">소계</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {cells.map((c, i) => (
          <div key={i} className="min-w-0">
            {c.label && <p className="text-[10px] text-gray-500 mb-0.5 truncate">{c.label}</p>}
            <MatrixCell field={c.field} highlight={row.isHighlight} />
          </div>
        ))}
      </div>
    </div>
  )
}

function MatrixRowDesktop({ row }: { row: SettlementMatrixRow }) {
  return (
    <tr
      className={
        'border-t border-gray-100 ' +
        (row.isHighlight ? 'bg-amber-50/90' : row.isSubtotal ? 'bg-slate-50/90' : 'bg-white')
      }
    >
      <td className="px-2 py-2 text-[10px] font-mono font-bold text-gray-400 whitespace-nowrap align-top">
        {row.key.toUpperCase()}
      </td>
      <td className="px-2 py-2 align-top min-w-[100px]">
        {row.incomeLabel && <p className="text-[10px] text-gray-500 mb-0.5">{row.incomeLabel}</p>}
        <MatrixCell field={row.income} highlight={row.isHighlight} />
      </td>
      <td className="px-2 py-2 align-top min-w-[100px]">
        {row.expenseLabel && <p className="text-[10px] text-gray-500 mb-0.5">{row.expenseLabel}</p>}
        <MatrixCell field={row.guideExpense} />
      </td>
      <td className="px-2 py-2 align-top min-w-[90px]">
        <MatrixCell field={row.companyExpense} />
      </td>
      <td className="px-2 py-2 align-top min-w-[90px]">
        {row.includedLabel && <p className="text-[10px] text-gray-500 mb-0.5">{row.includedLabel}</p>}
        <MatrixCell field={row.included} />
      </td>
      <td className="px-2 py-2 align-top min-w-[100px]">
        {row.settlementLabel && <p className="text-[10px] text-gray-500 mb-0.5">{row.settlementLabel}</p>}
        <MatrixCell field={row.settlement} highlight={row.isHighlight} />
      </td>
    </tr>
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
      <SectionHint excelRows={EXCEL_SECTIONS.summary.rows} hint={EXCEL_SECTIONS.summary.hint} />

      <div className="grid grid-cols-2 gap-2">
        <CalculatedField field={summary.income_total_usd} compact />
        <CalculatedField field={summary.expense_total_usd} compact />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <p className="text-xs font-semibold text-gray-700">정산내역 매트릭스</p>
          <p className="text-[10px] text-gray-400">엑셀 R79–R87 · 5열 구조 (D / H / J / O / R)</p>
        </div>
        <div className="text-[10px] font-mono px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-200">
          R77 정산비율 = {Math.round(settlementRatio * 100)}%
        </div>
      </div>

      {/* Mobile: card per row */}
      <div className="space-y-2 md:hidden">
        {matrix.map((row) => (
          <MatrixRowMobile key={row.key} row={row} />
        ))}
      </div>

      {/* Desktop: Excel-like table */}
      <div className="hidden md:block rounded-xl border border-gray-200 overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-2 py-2 text-[10px] font-mono text-gray-400 w-12">행</th>
                {COL_HEADERS.map((col) => (
                  <th key={col.key} className="px-2 py-2">
                    <div className="text-[10px] font-semibold text-gray-600">{col.label}</div>
                    <div className="text-[9px] font-mono text-blue-600">{col.ref}열</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <MatrixRowDesktop key={row.key} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2 pt-1">
        <div className="rounded-2xl bg-amber-50 border-2 border-amber-200 p-4">
          <p className="text-[10px] font-semibold text-amber-800 mb-2 uppercase tracking-wide">최종 가이드정산</p>
          <CalculatedField field={summary.guide_settlement_usd} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <CalculatedField field={summary.balance_usd} compact />
          <CalculatedField field={summary.company_gross_usd} compact />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <CalculatedField field={summary.company_profit_usd} compact />
          <CalculatedField field={summary.company_grand_total_usd} compact />
        </div>
      </div>
    </div>
  )
}
