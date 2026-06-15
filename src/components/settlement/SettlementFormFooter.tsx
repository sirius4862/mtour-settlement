'use client'

import { formatUsd } from './CalculatedField'
import type { AnnotatedNumber, SettlementCalcResult } from '@/lib/settlement/types-calc'
import {
  GUIDE_FOOTER_LABELS,
  GUIDE_PAYOUT_FLOOR_WARNING,
  Q75_NEGATIVE_WARNING,
  displayFieldLabel,
  companyDepositIsNegative,
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
  onSendForConfirmation,
  onRequestGuideCorrection,
  pendingAction = null,
  hideSubmit = false,
  showSendForConfirmation = false,
  showRequestGuideCorrection = false,
  saveLabel = '임시저장',
  submitLabel = '저장 후 제출',
  sendForConfirmationLabel = '가이드 최종확인 요청',
  requestGuideCorrectionLabel = '가이드 수정 요청',
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
  onSendForConfirmation?: () => void
  onRequestGuideCorrection?: () => void
  pendingAction?: 'save' | 'send' | 'submit' | 'request_edit' | null
  hideSubmit?: boolean
  showSendForConfirmation?: boolean
  showRequestGuideCorrection?: boolean
  saveLabel?: string
  submitLabel?: string
  sendForConfirmationLabel?: string
  requestGuideCorrectionLabel?: string
}) {
  const isSaving =
    pendingAction === 'save' || (saveStatus === 'saving' && pendingAction !== 'submit')
  const statusLabel =
    isSaving ? '저장 중…'
    : pendingAction === 'send' ? '처리 중…'
    : pendingAction === 'request_edit' ? '수정요청 처리 중…'
    : pendingAction === 'submit' ? '저장 후 제출 중…'
    : saveStatus === 'saved' && !dirty ? `저장됨 ${lastSavedAt ? formatTime(lastSavedAt) : ''}`
    : saveStatus === 'error' ? (saveError ?? '저장 실패')
    : dirty ? '변경됨' : '저장됨'

  const guideSettlement = calc.summary.guide_settlement_usd
  const guidePayout = calc.summary.guide_payout_usd
  const companyProfit = calc.summary.company_grand_total_usd
  const payoutIsFloored = guideSettlementIsNegative(guideSettlement.value)
  const q75IsNegative = companyDepositIsNegative(companyDeposit.value)

  return (
    <div className="fixed bottom-16 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-lg mx-auto px-4 py-3 space-y-2">
        <div className="flex items-start justify-between gap-3 text-sm">
          {audience === 'admin' ? (
            <>
              <div>
                <p className="text-[10px] text-gray-400 uppercase">
                  {displayFieldLabel(companyDeposit, 'admin')}
                </p>
                <p className="font-mono font-bold text-blue-700">
                  {formatUsd(companyDeposit.value)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase">
                  {displayFieldLabel(guideSettlement, 'admin')}
                </p>
                <p className={`font-mono font-bold ${payoutIsFloored ? 'text-red-600' : 'text-amber-700'}`}>
                  {formatUsd(guideSettlement.value)}
                </p>
              </div>
              <div className="text-right border-l border-gray-100 pl-3">
                <p className="text-[10px] text-gray-400 uppercase">
                  {displayFieldLabel(guidePayout, 'admin')}
                </p>
                <p className="font-mono font-bold text-amber-700">
                  {formatUsd(guidePayout.value)}
                </p>
              </div>
              <div className="text-right border-l border-gray-100 pl-3">
                <p className="text-[10px] text-gray-400 uppercase">
                  {displayFieldLabel(companyProfit, 'admin')}
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

        {q75IsNegative && (
          <p className="text-center text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">
            {Q75_NEGATIVE_WARNING}
          </p>
        )}

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
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={onSave}
            disabled={pendingAction !== null}
            className="flex-1 min-w-[120px] min-h-12 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {pendingAction === 'save' ? '저장 중…' : saveLabel}
          </button>
          {hideSubmit && showRequestGuideCorrection && onRequestGuideCorrection && (
            <button
              type="button"
              onClick={onRequestGuideCorrection}
              disabled={pendingAction !== null}
              className="flex-1 min-w-[120px] min-h-12 py-3 border border-red-200 text-red-700 rounded-xl text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
            >
              {pendingAction === 'request_edit' ? '처리 중…' : requestGuideCorrectionLabel}
            </button>
          )}
          {hideSubmit && showSendForConfirmation && onSendForConfirmation && (
            <button
              type="button"
              onClick={onSendForConfirmation}
              disabled={pendingAction !== null}
              className="flex-1 min-w-[120px] min-h-12 py-3 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 disabled:opacity-50"
            >
              {pendingAction === 'send' ? '처리 중…' : sendForConfirmationLabel}
            </button>
          )}
          {!hideSubmit && (
          <button
            type="button"
            onClick={onSubmit}
            disabled={pendingAction !== null}
            className="flex-1 min-h-12 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {pendingAction === 'submit' ? '저장 후 제출 중…' : submitLabel}
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
