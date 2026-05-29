'use client'

import type { ReactNode } from 'react'

export function RowActions({
  onDuplicate,
  onDelete,
}: {
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex gap-2 pt-2 border-t border-gray-50 mt-2">
      <button
        type="button"
        onClick={onDuplicate}
        className="flex-1 min-h-11 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
      >
        복제
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="flex-1 min-h-11 text-xs font-medium text-red-600 border border-red-100 rounded-lg hover:bg-red-50"
      >
        삭제
      </button>
    </div>
  )
}

export function DynamicRowList<T extends { clientId: string; deleted?: boolean }>({
  rows,
  renderRow,
  onAdd,
  addLabel = '+ 행 추가',
  emptyLabel = '항목이 없습니다. 아래 버튼으로 추가하세요.',
  hideAdd = false,
}: {
  rows: T[]
  renderRow: (row: T, index: number) => ReactNode
  onAdd: () => void
  addLabel?: string
  emptyLabel?: string
  hideAdd?: boolean
}) {
  const visible = rows.filter((r) => !r.deleted)
  const resolvedEmptyLabel =
    hideAdd && emptyLabel.includes('아래 버튼')
      ? '항목이 없습니다.'
      : emptyLabel

  return (
    <div className="space-y-3">
      {visible.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">{resolvedEmptyLabel}</p>
      ) : (
        visible.map((row, index) => (
          <div
            key={row.clientId}
            className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-gray-400">#{index + 1}</span>
            </div>
            {renderRow(row, index)}
          </div>
        ))
      )}
      {!hideAdd && (
      <button
        type="button"
        onClick={onAdd}
        className="w-full min-h-12 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-blue-600 hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
      >
        {addLabel}
      </button>
      )}
    </div>
  )
}

export function parseNum(v: string): number {
  const n = parseFloat(v.replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}
