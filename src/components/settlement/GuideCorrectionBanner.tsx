'use client'

import {
  getCorrectionSectionLabel,
  type ParsedCorrectionNote,
} from '@/lib/settlement/correction-request-meta'

export function GuideCorrectionBanner({
  correction,
  onJumpToTarget,
}: {
  correction: ParsedCorrectionNote
  onJumpToTarget?: () => void
}) {
  if (!correction.reason.trim()) return null

  const targetCount = correction.targets.length || correction.sections.length
  const sectionLabels = correction.sections.map((id) => getCorrectionSectionLabel(id))
  const reasonSnippet =
    correction.targets.length > 0
      ? correction.targets[0].reason
      : correction.reason

  return (
    <div
      className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 mb-4"
      role="alert"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-red-800">관리자 수정 요청</p>
          {targetCount > 0 && (
            <p className="text-xs text-red-700 mt-0.5">
              수정 요청 {targetCount}건
              {sectionLabels.length > 0 && ` · ${sectionLabels.join(', ')}`}
            </p>
          )}
          <p className="text-xs text-red-700 mt-1 line-clamp-2">{reasonSnippet}</p>
        </div>
        {onJumpToTarget && targetCount > 0 && (
          <button
            type="button"
            onClick={onJumpToTarget}
            className="shrink-0 px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-semibold hover:bg-red-700"
          >
            문제 항목으로 이동
          </button>
        )}
      </div>
    </div>
  )
}

export function CorrectionSectionAlert({
  message,
}: {
  message: string
}) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-3">
      <p className="text-xs font-semibold text-red-800">확인 필요</p>
      <p className="text-xs text-red-700 mt-0.5 whitespace-pre-wrap">{message}</p>
    </div>
  )
}

export function CorrectionRowAlert({
  message,
  proposed,
  fieldLabel,
}: {
  message: string
  proposed?: string | null
  fieldLabel?: string
}) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-2">
      <p className="text-xs font-semibold text-red-800">확인 필요</p>
      <p className="text-xs text-red-700 mt-0.5 whitespace-pre-wrap">{message}</p>
      {proposed && (
        <p className="text-xs text-red-600 mt-1">
          {fieldLabel ? `${fieldLabel} 제안: ` : '제안 값: '}
          <span className="font-mono font-semibold">{proposed}</span>
        </p>
      )}
    </div>
  )
}
