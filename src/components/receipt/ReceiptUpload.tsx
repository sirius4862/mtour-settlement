'use client'

import { useRef, useState } from 'react'
import { deleteReceipt } from '@/lib/actions/receiptActions'
import { filterReceiptsForTarget } from '@/lib/receipt/targets'
import type { ReceiptTarget } from '@/lib/receipt/types'
import type { Receipt } from '@/types'
import { useSettlementFormStore } from '@/lib/stores/settlementFormStore'
import { useReceiptUpload } from '@/hooks/useReceiptUpload'
import { ReceiptPreviewSheet } from './ReceiptPreviewSheet'
import { ReceiptThumbnail } from './ReceiptThumbnail'

export function ReceiptUpload({
  settlementId,
  target,
  editable,
  disabledReason,
  compact = false,
}: {
  settlementId: string | null
  target: ReceiptTarget
  editable: boolean
  disabledReason?: string
  compact?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const receipts = useSettlementFormStore((s) => s.receipts ?? [])
  const removeReceipt = useSettlementFormStore((s) => s.removeReceipt)
  const { upload, progress, state, error } = useReceiptUpload()
  const [preview, setPreview] = useState<Receipt | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const attached = filterReceiptsForTarget(receipts, target)
  const canUpload = editable && !!settlementId && (target.kind === 'settlement' || !!target.rowId)
  const busy = state !== 'idle' && state !== 'error' && state !== 'done'

  const handleFile = async (file: File | undefined) => {
    if (!file || !settlementId || !canUpload) return
    await upload({ settlementId, file, target })
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleDelete = async (receipt: Receipt) => {
    if (!editable) return
    setDeletingId(receipt.id)
    const result = await deleteReceipt(receipt.id)
    if (result.ok) removeReceipt(receipt.id)
    setDeletingId(null)
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {canUpload ? (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className={
              compact
                ? 'w-full min-h-10 text-xs font-medium text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-50 disabled:opacity-50'
                : 'w-full min-h-12 text-sm font-medium text-blue-600 border-2 border-dashed border-blue-200 rounded-xl hover:bg-blue-50/50 disabled:opacity-50'
            }
          >
            {busy ? uploadLabel(state, progress) : '+ 영수증 첨부'}
          </button>
          {busy && (
            <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
      ) : (
        <p className="text-xs text-gray-400">
          {disabledReason ??
            (!settlementId
              ? '임시저장 후 영수증을 첨부할 수 있습니다.'
              : target.kind !== 'settlement' && !target.rowId
                ? '항목 임시저장 후 첨부 가능합니다.'
                : '영수증 첨부가 비활성화되었습니다.')}
        </p>
      )}

      {attached.length > 0 && (
        <div className={`grid gap-2 ${compact ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {attached.map((r) => (
            <div key={r.id} className="relative group">
              <ReceiptThumbnail receipt={r} onClick={() => setPreview(r)} />
              {editable && (
                <button
                  type="button"
                  disabled={deletingId === r.id}
                  onClick={() => handleDelete(r)}
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white text-xs shadow disabled:opacity-50"
                  aria-label="삭제"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <ReceiptPreviewSheet
        receipt={preview}
        open={!!preview}
        onClose={() => setPreview(null)}
      />
    </div>
  )
}

function uploadLabel(state: string, progress: number): string {
  if (state === 'compressing') return '이미지 처리 중…'
  if (state === 'registering') return '저장 중…'
  return `업로드 중… ${progress}%`
}
