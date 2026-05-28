import type { SettlementFieldChange } from '@/types'

interface Props {
  changes: SettlementFieldChange[]
}

export function ConfirmationDiffList({ changes }: Props) {
  if (changes.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <p className="text-sm text-gray-500 text-center py-4">
          관리자가 수정한 항목이 없습니다. 금액을 확인한 뒤 승인해 주세요.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50">
        <p className="text-xs font-semibold text-gray-600">변경된 항목 ({changes.length}건)</p>
        <p className="text-[10px] text-gray-400 mt-0.5">변경 후 값은 빨간색으로 표시됩니다.</p>
      </div>
      <div className="divide-y divide-gray-50">
        {changes.map((c) => (
          <div key={c.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">{c.label}</p>
                {c.excel_ref && (
                  <p className="text-[10px] text-gray-400 font-mono mt-0.5">{c.excel_ref}</p>
                )}
              </div>
              <div className="text-right shrink-0 space-y-1">
                <p className="text-xs text-gray-500">
                  <span className="text-gray-400">제출 시 </span>
                  <span className="font-mono">{c.old_display ?? '—'}</span>
                </p>
                <p className="text-xs font-semibold">
                  <span className="text-gray-400 font-normal">변경 후 </span>
                  <span className="font-mono text-red-600">{c.new_display ?? '—'}</span>
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
