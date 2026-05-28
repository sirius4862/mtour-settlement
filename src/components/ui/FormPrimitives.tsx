'use client'

import type { InputHTMLAttributes, ReactNode } from 'react'

const baseInput =
  'w-full min-h-12 px-3 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400'

export function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}

export function ManualField({
  label,
  excelRef,
  suffix,
  required,
  className = '',
  ...props
}: {
  label: string
  excelRef?: string
  suffix?: string
  required?: boolean
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <FieldLabel required={required}>{label}</FieldLabel>
        {excelRef && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
            {excelRef}
          </span>
        )}
      </div>
      <div className="relative">
        <input className={baseInput + (suffix ? ' pr-12 text-right font-mono' : '')} {...props} />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

export function ReadOnlyField({
  label,
  value,
  excelRef,
  sub,
}: {
  label: string
  value: string
  excelRef?: string
  sub?: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs text-gray-500">{label}</span>
        {excelRef && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">
            {excelRef}
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-gray-800">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export function SectionCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 p-4 space-y-3 ${className}`}>
      {children}
    </div>
  )
}

export function MockBadge() {
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
      MOCK
    </span>
  )
}
