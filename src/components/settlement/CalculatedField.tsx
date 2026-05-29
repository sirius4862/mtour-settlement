'use client'

import type { AnnotatedNumber } from '@/lib/settlement/types-calc'
import { formatUsd, formatVnd } from '@/lib/settlement/format-currency'
import { FormulaHint } from './FormulaHint'

export { formatUsd, formatVnd } from '@/lib/settlement/format-currency'

export function CalculatedField({
  field,
  currency = 'usd',
  compact = false,
  className = '',
  formulaOverride,
  labelOverride,
}: {
  field: AnnotatedNumber
  currency?: 'usd' | 'vnd' | 'ratio'
  compact?: boolean
  className?: string
  /** UI-only formula text (does not change calc.ts). */
  formulaOverride?: string
  /** UI-only label (does not change calc.ts). */
  labelOverride?: string
}) {
  const display =
    currency === 'vnd'
      ? formatVnd(field.value)
      : currency === 'ratio'
        ? `${Math.round(field.value * 100)}%`
        : formatUsd(field.value)
  const formulaLabel = formulaOverride ?? field.formula
  const label = labelOverride ?? field.label

  if (compact) {
    return (
      <div className={`flex items-center justify-between gap-2 ${className}`}>
        <div className="min-w-0">
          <p className="text-xs text-gray-600 truncate">{label}</p>
          <p className="text-[10px] font-mono text-gray-400">{field.excelRef}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="font-mono text-sm font-semibold text-gray-900">{display}</span>
          <FormulaHint formula={formulaLabel} excelRef={field.excelRef} />
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-700">{label}</p>
          <p className="text-[10px] font-mono text-blue-600 mt-0.5">{field.excelRef}</p>
        </div>
        <FormulaHint formula={formulaLabel} excelRef={field.excelRef} />
      </div>
      <p className="font-mono text-lg font-semibold text-gray-900 mt-1 text-right">{display}</p>
      <p className="text-[10px] text-gray-400 mt-1 truncate" title={formulaLabel}>
        {formulaLabel}
      </p>
    </div>
  )
}
