'use client'

import { useCallback, useState } from 'react'
import {
  createReceiptUploadUrl,
  registerReceiptMetadata,
} from '@/lib/actions/receiptActions'
import { compressReceiptImage } from '@/lib/receipt/compress-image'
import type { ReceiptTarget } from '@/lib/receipt/types'
import type { Receipt } from '@/types'
import { useSettlementFormStore } from '@/lib/stores/settlementFormStore'

export type UploadState = 'idle' | 'compressing' | 'uploading' | 'registering' | 'done' | 'error'

export function useReceiptUpload() {
  const [progress, setProgress] = useState(0)
  const [state, setState] = useState<UploadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const addReceipt = useSettlementFormStore((s) => s.addReceipt)

  const upload = useCallback(
    async (params: {
      settlementId: string
      file: File
      target: ReceiptTarget
    }): Promise<Receipt | null> => {
      setError(null)
      setProgress(0)

      try {
        setState('compressing')
        const compressed = await compressReceiptImage(params.file)

        setState('uploading')
        const urlResult = await createReceiptUploadUrl({
          settlementId: params.settlementId,
          fileName: compressed.name,
          mimeType: compressed.type,
          fileSize: compressed.size,
        })

        if (!urlResult.ok || !urlResult.signedUrl || !urlResult.path) {
          throw new Error(urlResult.error ?? '업로드 URL 생성 실패')
        }

        await xhrPut(urlResult.signedUrl, compressed, compressed.type, setProgress)

        setState('registering')
        setProgress(100)
        const metaResult = await registerReceiptMetadata({
          settlementId: params.settlementId,
          storagePath: urlResult.path,
          fileName: compressed.name,
          fileSize: compressed.size,
          mimeType: compressed.type,
          target: params.target,
        })

        if (!metaResult.ok || !metaResult.receipt) {
          throw new Error(metaResult.error ?? '메타 저장 실패')
        }

        addReceipt(metaResult.receipt)
        setState('done')
        return metaResult.receipt
      } catch (e) {
        const msg = e instanceof Error ? e.message : '업로드 실패'
        setError(msg)
        setState('error')
        return null
      } finally {
        setTimeout(() => {
          setState('idle')
          setProgress(0)
        }, 800)
      }
    },
    [addReceipt],
  )

  return { upload, progress, state, error }
}

function xhrPut(
  url: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 95))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Storage 업로드 실패 (${xhr.status})`))
    }

    xhr.onerror = () => reject(new Error('네트워크 오류'))
    xhr.send(file)
  })
}
