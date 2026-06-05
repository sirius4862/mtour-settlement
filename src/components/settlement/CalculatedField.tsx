'use client'

import type { AnnotatedNumber } from '@/lib/settlement/types-calc'
import { formatUsd, formatVnd } from '@/lib/settlement/format-currency'
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
  const label = labelOverride ?? field.label
  void formulaOverride
  if (compact) {
    return (
      <div className={`flex items-center justify-between gap-2 ${className}`}>
        <div className="min-w-0">
          <p className="text-xs text-gray-600 truncate">{label}</p>
        </div>
        <span className="font-mono text-sm font-semibold text-gray-900 shrink-0">{display}</span>
      </div>
    )
  }

  return (
    <div className={`rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 ${className}`}>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-700">{label}</p>
      </div>
      <p className="font-mono text-lg font-semibold text-gray-900 mt-1 text-right">{display}</p>
    </div>
  )
}
