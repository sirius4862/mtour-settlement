'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { guideConfirm, guideRequestClarification } from '@/lib/actions/settlementActions'

interface Props {
  settlementId: string
}

export function ConfirmPanel({ settlementId }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [showClarify, setShowClarify] = useState(false)
  const [message, setMessage] = useState('')

  const handleConfirm = () => {
    setError('')
    start(async () => {
      const res = await guideConfirm(settlementId)
      if (res.ok) {
        router.push(`/guide/settlements/${settlementId}`)
      } else {
        setError(res.error ?? '오류 발생')
      }
    })
  }

  const handleClarify = () => {
    setError('')
    start(async () => {
      const res = await guideRequestClarification(settlementId, message)
      if (res.ok) {
        router.push(`/guide/settlements/${settlementId}`)
      } else {
        setError(res.error ?? '오류 발생')
      }
    })
  }

  return (
    <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-100 p-4 space-y-3 max-w-lg mx-auto shadow-lg">
      {error && <p className="text-xs text-red-500">{error}</p>}

      {showClarify && (
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="이의 내용을 입력하세요 (필수)"
          rows={3}
          autoFocus
          className="w-full px-3 py-2 text-sm border border-rose-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-rose-400"
        />
      )}

      <div className="flex gap-2 flex-wrap">
        {!showClarify && (
          <>
            <button
              onClick={() => setShowClarify(true)}
              disabled={pending}
              className="px-4 py-3 border border-rose-200 text-rose-600 rounded-xl text-sm font-medium hover:bg-rose-50 disabled:opacity-40"
            >
              이의 요청
            </button>
            <button
              onClick={handleConfirm}
              disabled={pending}
              className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40"
            >
              {pending ? '처리 중…' : '확인하고 승인'}
            </button>
          </>
        )}

        {showClarify && (
          <>
            <button
              onClick={() => { setShowClarify(false); setMessage('') }}
              className="px-4 py-3 border border-gray-200 text-gray-600 rounded-xl text-sm"
            >
              취소
            </button>
            <button
              onClick={handleClarify}
              disabled={pending || !message.trim()}
              className="flex-1 py-3 bg-rose-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40"
            >
              {pending ? '처리 중…' : '이의 제출'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
