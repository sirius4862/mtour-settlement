'use client'

import { useState, useTransition } from 'react'
import { reviewSettlement, sendForConfirmation } from '@/lib/actions/settlementActions'
import { useRouter } from 'next/navigation'

interface Props {
  settlementId: string
  canSendForConfirmation: boolean
  canRequestEdit: boolean
  canReopen: boolean
  canPay: boolean
  currentAdminNote: string
}

export function ReviewPanel({
  settlementId,
  canSendForConfirmation,
  canRequestEdit,
  canReopen,
  canPay,
  currentAdminNote,
}: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [adminNote, setAdminNote] = useState(currentAdminNote)
  const [error, setError] = useState('')

  const handleReview = (action: 'request_edit' | 'pay' | 'reopen') => {
    setError('')
    start(async () => {
      const res = await reviewSettlement({
        id: settlementId,
        action,
        adminNote: adminNote.trim() || undefined,
      })
      if (res.ok) {
        router.refresh()
      } else {
        setError(res.error ?? '오류 발생')
      }
    })
  }

  const handleSendForConfirmation = () => {
    setError('')
    start(async () => {
      const res = await sendForConfirmation(settlementId, adminNote.trim() || undefined)
      if (res.ok) {
        router.refresh()
      } else {
        setError(res.error ?? '오류 발생')
      }
    })
  }

  const showActions = canSendForConfirmation || canRequestEdit || canReopen || canPay
  if (!showActions) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 space-y-3 max-w-2xl mx-auto shadow-lg">
      {error && <p className="text-xs text-red-500">{error}</p>}

      <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)}
        placeholder="관리자 메모 (선택)"
        rows={2}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />

      <div className="flex gap-2 flex-wrap">
        {canRequestEdit && (
          <button onClick={() => handleReview('request_edit')} disabled={pending}
            className="px-4 py-2.5 border border-blue-200 text-blue-600 rounded-xl text-sm font-medium hover:bg-blue-50 disabled:opacity-40">
            수정요청
          </button>
        )}

        {canSendForConfirmation && (
          <button onClick={handleSendForConfirmation} disabled={pending}
            className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 disabled:opacity-40">
            {pending ? '처리 중…' : '최종확인 보내기'}
          </button>
        )}

        {canPay && (
          <button onClick={() => handleReview('pay')} disabled={pending}
            className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-40">
            {pending ? '처리 중…' : '지급완료 처리'}
          </button>
        )}

        {canReopen && (
          <button onClick={() => handleReview('reopen')} disabled={pending}
            className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 disabled:opacity-40">
            {pending ? '처리 중…' : '지급 재오픈'}
          </button>
        )}
      </div>
    </div>
  )
}
