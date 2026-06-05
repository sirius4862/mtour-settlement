'use client'

export function SectionHint(_props: { excelRows: string; hint: string }) {
  return null
}

export function ValidationBanner({
  issues,
  onDismiss,
}: {
  issues: Array<{ sectionId: string; message: string; severity: 'error' | 'warning' }>
  onDismiss?: () => void
}) {
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')
  if (!errors.length && !warnings.length) return null

  return (
    <div className="space-y-2 mb-4">
      {errors.length > 0 && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5" role="alert">
          <p className="text-xs font-semibold text-red-800 mb-1">입력 확인 필요</p>
          <ul className="text-xs text-red-700 space-y-0.5 list-disc list-inside">
            {errors.map((e, i) => (
              <li key={`e-${i}`}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
          <p className="text-xs font-semibold text-amber-800 mb-1">안내</p>
          <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
            {warnings.slice(0, 3).map((w, i) => (
              <li key={`w-${i}`}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-[10px] text-gray-400 underline"
        >
          닫기
        </button>
      )}
    </div>
  )
}
