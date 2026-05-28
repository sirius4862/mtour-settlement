'use client'

import type { AnnotatedNumber, SettlementCalcResult, SettlementMatrixRow } from '@/lib/settlement/types-calc'
import {
  displayFieldLabel,
  GUIDE_FOOTER_LABELS,
  GUIDE_PAYOUT_FLOOR_WARNING,
  guideSettlementIsNegative,
  shouldShowGuideSummaryMatrix,
  shouldShowMatrixRow,
  shouldShowSummaryField,
  type SummaryAudience,
} from '@/lib/settlement/display-labels'
import { uiFormulaLabel } from '@/lib/settlement/field-display'
import { CalculatedField, formatUsd } from '../CalculatedField'
import { SectionHint } from '../SectionHint'
import { EXCEL_SECTIONS } from '@/lib/settlement/excel-sections'

const COL_HEADERS = [
  { key: 'd', label: '수익', ref: 'D', sub: 'D79·쇼핑·팁 등 (표시)' },
  { key: 'h', label: '가이드지출', ref: 'H', sub: 'Hotel, meals, TC…' },
  { key: 'j', label: '회사지출', ref: 'J', sub: 'Company hotel, TC…' },
  { key: 'o', label: '기타포함', ref: 'O', sub: 'Vehicle, taxes…' },
  { key: 'r', label: '정산', ref: 'R', sub: 'Balance, guide pay…' },
] as const

function MatrixCell({
  field,
  highlight,
  empty = '—',
  showExcelRef = true,
}: {
  field?: AnnotatedNumber
  highlight?: boolean
  empty?: string
  showExcelRef?: boolean
}) {
  if (!field) {
    return <span className="text-gray-200 text-sm">{empty}</span>
  }
  const isBasicInfoMirror = field.excelRef === 'D79'
  return (
    <div className={highlight ? 'text-amber-900' : ''}>
      <div className={`font-mono text-sm tabular-nums ${highlight ? 'font-bold' : 'font-semibold text-gray-900'}`}>
        {formatUsd(field.value)}
      </div>
      {showExcelRef && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[9px] font-mono text-blue-600/80">{field.excelRef}</span>
          {isBasicInfoMirror && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-slate-100 text-slate-500">기본정보</span>
          )}
        </div>
      )}
      {isBasicInfoMirror && (
        <p className="text-[8px] text-gray-400 mt-0.5">{uiFormulaLabel(field)}</p>
      )}
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
  audience = 'guide',
}: {
  calc: SettlementCalcResult
  settlementRatio: number
  audience?: SummaryAudience
}) {
  const { matrix, summary } = calc
  const showMatrix = shouldShowGuideSummaryMatrix(audience)
  const visibleMatrix = matrix.filter((row) => shouldShowMatrixRow(row.key, audience))
  const payoutIsFloored = guideSettlementIsNegative(summary.guide_settlement_usd.value)
  const guideDisplayField =
    audience === 'admin' ? summary.guide_settlement_usd : summary.guide_payout_usd

  const summaryFields = [
    summary.balance_usd,
    summary.company_gross_usd,
    summary.company_profit_usd,
    summary.company_grand_total_usd,
    ...(audience === 'admin' && payoutIsFloored ? [summary.guide_payout_usd] : []),
  ].filter((field) => shouldShowSummaryField(field, audience))

  return (
    <div className="space-y-4">
      <SectionHint excelRows={EXCEL_SECTIONS.summary.rows} hint={EXCEL_SECTIONS.summary.hint} />

      <div className={`grid gap-2 ${audience === 'guide' ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <CalculatedField field={summary.income_total_usd} compact />
        {audience === 'admin' && (
          <CalculatedField field={summary.expense_total_usd} compact />
        )}
      </div>

      {showMatrix && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div>
              <p className="text-xs font-semibold text-gray-700">정산내역 매트릭스</p>
              <p className="text-[10px] text-gray-400">엑셀 R79–R87 · 5열 구조 (D / H / J / O / R)</p>
            </div>
            <div className="text-[10px] font-mono px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-200">
              R77 정산비율 = {Math.round(settlementRatio * 100)}%
            </div>
          </div>

          <div className="space-y-2 md:hidden">
            {visibleMatrix.map((row) => (
              <MatrixRowMobile key={row.key} row={row} />
            ))}
          </div>

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
                  {visibleMatrix.map((row) => (
                    <MatrixRowDesktop key={row.key} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="space-y-2 pt-1">
        <div className="rounded-2xl bg-amber-50 border-2 border-amber-200 p-4">
          <p className="text-[10px] font-semibold text-amber-800 mb-2 uppercase tracking-wide">
            {audience === 'guide'
              ? GUIDE_FOOTER_LABELS.guideSettlement
              : displayFieldLabel(guideDisplayField, audience)}
          </p>
          <CalculatedField
            field={guideDisplayField}
            labelOverride={
              audience === 'guide'
                ? GUIDE_FOOTER_LABELS.guideSettlement
                : displayFieldLabel(guideDisplayField, audience)
            }
          />
          {audience === 'admin' && payoutIsFloored && (
            <div className="mt-3 pt-3 border-t border-amber-200">
              <p className="text-[10px] font-semibold text-amber-800 mb-1 uppercase tracking-wide">
                {displayFieldLabel(summary.guide_payout_usd, 'admin')}
              </p>
              <CalculatedField
                field={summary.guide_payout_usd}
                labelOverride={displayFieldLabel(summary.guide_payout_usd, 'admin')}
              />
            </div>
          )}
          {payoutIsFloored && audience === 'guide' && (
            <p className="text-xs text-amber-700 mt-2">{GUIDE_PAYOUT_FLOOR_WARNING}</p>
          )}
        </div>
        {summaryFields.length > 0 && (
          <div className={`grid gap-2 ${summaryFields.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {summaryFields.map((field) => (
              <CalculatedField
                key={field.excelRef}
                field={field}
                compact
                labelOverride={displayFieldLabel(field, audience)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
