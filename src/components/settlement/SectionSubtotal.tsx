'use client'

import type { AnnotatedNumber } from '@/lib/settlement/types-calc'
import { CalculatedField, formatUsd, formatVnd } from './CalculatedField'

export function SectionSubtotal({
  title = '섹션 소계',
  fields,
  sticky = false,
}: {
  title?: string
  fields: AnnotatedNumber[]
  sticky?: boolean
}) {
  if (!fields.length) return null

  return (
    <div
      className={
        (sticky ? 'sticky bottom-0 z-10 ' : '') +
        'mt-3 -mx-4 px-4 py-3 bg-slate-800 text-white border-t border-slate-700'
      }
    >
      <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-2">{title}</p>
      <div className="space-y-1.5">
        {fields.map((f) => (
          <div key={f.excelRef + f.label} className="flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <span className="text-slate-200">{f.label}</span>
              <span className="ml-2 text-[10px] font-mono text-slate-500">{f.excelRef}</span>
            </div>
            <span className="font-mono font-semibold shrink-0">
              {f.label.includes('VND') || f.label.includes('₫')
                ? formatVnd(f.value)
                : formatUsd(f.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Inline subtotal preview for collapsed accordion header */
export function SubtotalPreview({ field }: { field?: AnnotatedNumber }) {
  if (!field) return null
  return (
    <span className="text-xs font-mono text-blue-600 shrink-0">
      {formatUsd(field.value)}
    </span>
  )
}

export function SectionSubtotalPanel({ fields }: { fields: AnnotatedNumber[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {fields.map((f) => (
        <CalculatedField key={f.excelRef + f.label} field={f} compact />
      ))}
    </div>
  )
}
