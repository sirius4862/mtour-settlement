'use client'

import { useEffect, useState } from 'react'
import { getReceiptSignedUrls } from '@/lib/actions/receiptActions'
import type { Receipt } from '@/types'

export function ReceiptThumbnail({
  receipt,
  onClick,
  className = '',
}: {
  receipt: Receipt
  onClick?: () => void
  className?: string
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getReceiptSignedUrls([receipt.id]).then((res) => {
      if (!cancelled && res.ok && res.urls?.[receipt.id]) {
        setUrl(res.urls[receipt.id])
      }
    })
    return () => { cancelled = true }
  }, [receipt.id])

  const inner = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={receipt.file_name}
      className="w-full h-full object-cover"
      loading="lazy"
    />
  ) : (
    <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 bg-gray-100">
      …
    </div>
  )

  const cls = `relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50 ${className}`

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${cls} active:opacity-80`}>
        {inner}
      </button>
    )
  }

  return <div className={cls}>{inner}</div>
}

export function useReceiptThumbnailUrls(receiptIds: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!receiptIds.length) {
      setUrls({})
      return
    }
    let cancelled = false
    getReceiptSignedUrls(receiptIds).then((res) => {
      if (!cancelled && res.ok && res.urls) setUrls(res.urls)
    })
    return () => { cancelled = true }
  }, [receiptIds.join(',')])

  return urls
}
