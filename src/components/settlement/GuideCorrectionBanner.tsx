'use client'

import {
  getCorrectionSectionLabel,
  type ParsedCorrectionNote,
} from '@/lib/settlement/correction-request-meta'

export function GuideCorrectionBanner({ correction }: { correction: ParsedCorrectionNote }) {
  if (!correction.reason.trim()) return null

  return (
    <div
      className="rounded-xl bg-red-50 border border-red-200 px-3 py-3 mb-4"
      role="alert"
    >
      <p className="text-sm font-semibold text-red-800 mb-1">관리자 수정 요청</p>
      <p className="text-sm text-red-700 whitespace-pre-wrap">{correction.reason}</p>
      {correction.sections.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {correction.sections.map((id) => (
            <span
              key={id}
              className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-semibold"
            >
              {getCorrectionSectionLabel(id)}
            </span>
          ))}
        </div>
      )}
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
      <p className="text-xs text-red-700 mt-0.5">{message}</p>
    </div>
  )
}
