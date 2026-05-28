'use client'

import { formatUsd } from './CalculatedField'
import type { SettlementCalcResult } from '@/lib/settlement/types-calc'
import type { SaveStatus } from '@/lib/settlement/form-types'

export function SettlementFormFooter({
  calc,
  saveStatus,
  dirty,
  lastSavedAt,
  saveError,
  onSave,
  onSubmit,
  pending,
}: {
  calc: SettlementCalcResult
  saveStatus: SaveStatus
  dirty: boolean
  lastSavedAt: string | null
  saveError: string | null
  onSave: () => void
  onSubmit: () => void
  pending: boolean
}) {
  const statusLabel =
    saveStatus === 'saving' ? '저장 중…'
    : saveStatus === 'saved' && !dirty ? `저장됨 ${lastSavedAt ? formatTime(lastSavedAt) : ''}`
    : saveStatus === 'error' ? (saveError ?? '저장 실패')
    : dirty ? '변경됨' : '저장됨'

  return (
    <div className="fixed bottom-16 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-lg mx-auto px-4 py-3 space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <div>
            <p className="text-[10px] text-gray-400 uppercase">가이드정산 · R85</p>
            <p className="font-mono font-bold text-amber-700">
              {formatUsd(calc.summary.guide_settlement_usd.value)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400 uppercase">회사총수익 · R87</p>
            <p className="font-mono font-bold text-blue-700">
              {formatUsd(calc.summary.company_grand_total_usd.value)}
            </p>
          </div>
        </div>
        <p className={`text-center text-xs ${
          saveStatus === 'error' ? 'text-red-500' :
          saveStatus === 'saved' && !dirty ? 'text-emerald-600' :
          dirty ? 'text-amber-600' : 'text-gray-400'
        }`}>
          {statusLabel}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="flex-1 min-h-12 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {pending ? '저장 중…' : '임시저장'}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending}
            className="flex-1 min-h-12 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            제출하기
          </button>
        </div>
      </div>
    </div>
  )
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}
