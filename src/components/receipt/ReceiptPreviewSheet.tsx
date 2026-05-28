'use client'

import { useEffect, useState } from 'react'
import { getReceiptSignedUrls } from '@/lib/actions/receiptActions'
import type { Receipt } from '@/types'

export function ReceiptPreviewSheet({
  receipt,
  open,
  onClose,
}: {
  receipt: Receipt | null
  open: boolean
  onClose: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !receipt) {
      setUrl(null)
      return
    }
    let cancelled = false
    getReceiptSignedUrls([receipt.id]).then((res) => {
      if (!cancelled && res.ok && res.urls?.[receipt.id]) {
        setUrl(res.urls[receipt.id])
      }
    })
    return () => { cancelled = true }
  }, [open, receipt])

  if (!open || !receipt) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="영수증 미리보기"
    >
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <p className="text-sm truncate flex-1 mr-3">{receipt.file_name}</p>
        <button
          type="button"
          onClick={onClose}
          className="min-w-11 min-h-11 flex items-center justify-center rounded-full bg-white/10"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={receipt.file_name} className="max-w-full max-h-full object-contain" />
        ) : (
          <p className="text-white/60 text-sm">불러오는 중…</p>
        )}
      </div>
    </div>
  )
}
