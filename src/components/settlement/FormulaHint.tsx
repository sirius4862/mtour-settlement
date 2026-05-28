'use client'

import { useState } from 'react'

export function FormulaHint({ formula, excelRef }: { formula: string; excelRef: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        aria-label={`${excelRef} 수식 보기`}
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.25" />
          <path d="M7 6.5V10M7 4.5v.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="닫기"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-8 z-50 w-56 p-3 bg-gray-900 text-white text-xs rounded-xl shadow-lg">
            <p className="font-mono text-blue-300 mb-1">{excelRef}</p>
            <p className="leading-relaxed">{formula}</p>
          </div>
        </>
      )}
    </div>
  )
}
