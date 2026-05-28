'use client'

import { useState, useTransition } from 'react'
import { reviewSettlement } from '@/lib/actions/settlementActions'
import { useRouter } from 'next/navigation'

interface Props {
  settlementId: string
  canReview: boolean
  canReject: boolean
  canRequestEdit: boolean
  canPay: boolean
  currentAdminNote: string
}

export function ReviewPanel({
  settlementId,
  canReview,
  canReject,
  canRequestEdit,
  canPay,
  currentAdminNote,
}: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [adminNote, setAdminNote] = useState(currentAdminNote)
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [error, setError] = useState('')

  const handle = (action: 'approve' | 'reject' | 'request_edit' | 'pay') => {
    setError('')
    start(async () => {
      const res = await reviewSettlement({
        id: settlementId, action,
        rejectReason: action === 'reject' ? rejectReason : undefined,
        adminNote: adminNote.trim() || undefined,
      })
      if (res.ok) {
        router.refresh()
      } else {
        setError(res.error ?? '오류 발생')
      }
    })
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 space-y-3 max-w-2xl mx-auto shadow-lg">
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* 관리자 메모 */}
      <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)}
        placeholder="관리자 메모 (선택)"
        rows={2}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />

      {/* 반려 사유 */}
      {showReject && (
        <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
          placeholder="반려 사유를 입력하세요 (필수)"
          rows={2} autoFocus
          className="w-full px-3 py-2 text-sm border border-red-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-red-400" />
      )}

      <div className="flex gap-2 flex-wrap">
        {(canReview || canReject) && !showReject && canReject && (
          <button onClick={() => setShowReject(true)} disabled={pending}
            className="px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 disabled:opacity-40">
            반려
          </button>
        )}

        {canReview && !showReject && (
          <button onClick={() => handle('approve')} disabled={pending}
            className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40">
            {pending ? '처리 중…' : '✓ 승인'}
          </button>
        )}

        {(canReview || canReject) && showReject && (
          <>
            <button onClick={() => { setShowReject(false); setRejectReason('') }}
              className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm">
              취소
            </button>
            <button onClick={() => handle('reject')} disabled={pending || !rejectReason.trim()}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40">
              {pending ? '처리 중…' : '반려 확정'}
            </button>
          </>
        )}

        {canRequestEdit && !showReject && (
          <button onClick={() => handle('request_edit')} disabled={pending}
            className="px-4 py-2.5 border border-blue-200 text-blue-600 rounded-xl text-sm font-medium hover:bg-blue-50 disabled:opacity-40">
            수정 허용
          </button>
        )}

        {canPay && !showReject && (
          <button onClick={() => handle('pay')} disabled={pending}
            className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-40">
            {pending ? '처리 중…' : '지급 완료'}
          </button>
        )}
      </div>
    </div>
  )
}
