'use client'

import { formatUsd } from './CalculatedField'
import type { AnnotatedNumber, SettlementCalcResult } from '@/lib/settlement/types-calc'
import {
  GUIDE_FOOTER_LABELS,
  GUIDE_PAYOUT_FLOOR_WARNING,
  displayFieldLabel,
  guideSettlementIsNegative,
  type SummaryAudience,
} from '@/lib/settlement/display-labels'
import type { SaveStatus } from '@/lib/settlement/form-types'

export function SettlementFormFooter({
  calc,
  companyDeposit,
  audience = 'guide',
  saveStatus,
  dirty,
  lastSavedAt,
  saveError,
  onSave,
  onSubmit,
  pending,
  hideSubmit = false,
  saveLabel = '임시저장',
}: {
  calc: SettlementCalcResult
  companyDeposit: AnnotatedNumber
  audience?: SummaryAudience
  saveStatus: SaveStatus
  dirty: boolean
  lastSavedAt: string | null
  saveError: string | null
  onSave: () => void
  onSubmit: () => void
  pending: boolean
  hideSubmit?: boolean
  saveLabel?: string
}) {
  const statusLabel =
    saveStatus === 'saving' ? '저장 중…'
    : saveStatus === 'saved' && !dirty ? `저장됨 ${lastSavedAt ? formatTime(lastSavedAt) : ''}`
    : saveStatus === 'error' ? (saveError ?? '저장 실패')
    : dirty ? '변경됨' : '저장됨'

  const guideSettlement = calc.summary.guide_settlement_usd
  const guidePayout = calc.summary.guide_payout_usd
  const companyProfit = calc.summary.company_grand_total_usd
  const payoutIsFloored = guideSettlementIsNegative(guideSettlement.value)

  return (
    <div className="fixed bottom-16 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-lg mx-auto px-4 py-3 space-y-2">
        <div className="flex items-start justify-between gap-3 text-sm">
          {audience === 'admin' ? (
            <>
              <div>
                <p className="text-[10px] text-gray-400 uppercase">
                  {displayFieldLabel(companyDeposit, 'admin')} · {companyDeposit.excelRef}
                </p>
                <p className="font-mono font-bold text-blue-700">
                  {formatUsd(companyDeposit.value)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase">
                  {displayFieldLabel(guideSettlement, 'admin')} · {guideSettlement.excelRef}
                </p>
                <p className={`font-mono font-bold ${payoutIsFloored ? 'text-red-600' : 'text-amber-700'}`}>
                  {formatUsd(guideSettlement.value)}
                </p>
              </div>
              <div className="text-right border-l border-gray-100 pl-3">
                <p className="text-[10px] text-gray-400 uppercase">
                  {displayFieldLabel(guidePayout, 'admin')} · {guidePayout.excelRef}
                </p>
                <p className="font-mono font-bold text-amber-700">
                  {formatUsd(guidePayout.value)}
                </p>
              </div>
              <div className="text-right border-l border-gray-100 pl-3">
                <p className="text-[10px] text-gray-400 uppercase">
                  {displayFieldLabel(companyProfit, 'admin')} · {companyProfit.excelRef}
                </p>
                <p className="font-mono font-bold text-emerald-700">
                  {formatUsd(companyProfit.value)}
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-[10px] text-gray-500 font-medium">
                  {GUIDE_FOOTER_LABELS.companyDeposit}
                </p>
                <p className="font-mono font-bold text-blue-700">
                  {formatUsd(companyDeposit.value)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-500 font-medium">
                  {GUIDE_FOOTER_LABELS.guideSettlement}
                </p>
                <p className="font-mono font-bold text-amber-700">
                  {formatUsd(guidePayout.value)}
                </p>
              </div>
            </>
          )}
        </div>

        {payoutIsFloored && audience === 'guide' && (
          <p className="text-center text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
            {GUIDE_PAYOUT_FLOOR_WARNING}
          </p>
        )}

        <p className={`text-center text-xs ${
          saveStatus === 'error' ? 'text-red-500' :
          saveStatus === 'saved' && !dirty ? 'text-emerald-600' :
          dirty ? 'text-amber-600' : 'text-gray-400'
        }`}>
          {statusLabel}
        </p>
        <div className={`flex gap-2 ${hideSubmit ? '' : ''}`}>
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className={`min-h-12 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 ${hideSubmit ? 'flex-1' : 'flex-1'}`}
          >
            {pending ? '저장 중…' : saveLabel}
          </button>
          {!hideSubmit && (
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending}
            className="flex-1 min-h-12 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            제출하기
          </button>
          )}
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
