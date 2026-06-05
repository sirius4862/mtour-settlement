'use client'

import { useState, useTransition } from 'react'
import {
  recallSettlement,
  reviewSettlement,
  saveAdminNoteBeforeConfirmation,
  sendForConfirmation,
} from '@/lib/actions/settlementActions'
import { useRouter } from 'next/navigation'

interface Props {
  settlementId: string
  canSendForConfirmation: boolean
  canRequestEdit: boolean
  canReopen: boolean
  canPay: boolean
  canRecall: boolean
  currentAdminNote: string
}

const RECALL_CONFIRM_COPY =
  '이 정산서를 회수하면 가이드 화면에서 더 이상 최종확인/수정요청 대상으로 보이지 않습니다. 관리자 수정 상태로 되돌릴까요?'

export function ReviewPanel({
  settlementId,
  canSendForConfirmation,
  canRequestEdit,
  canReopen,
  canPay,
  canRecall,
  currentAdminNote,
}: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [adminNote, setAdminNote] = useState(currentAdminNote)
  const [error, setError] = useState('')
  const [confirmingRecall, setConfirmingRecall] = useState(false)
  const [recallReason, setRecallReason] = useState('')

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
      const note = adminNote.trim() || undefined
      const saveRes = await saveAdminNoteBeforeConfirmation(settlementId, note)
      if (!saveRes.ok) {
        setError(saveRes.error ?? '메모 저장 실패')
        return
      }
      const res = await sendForConfirmation(settlementId, note)
      if (res.ok) {
        router.refresh()
      } else {
        setError(res.error ?? '오류 발생')
      }
    })
  }

  const handleRecall = () => {
    setError('')
    start(async () => {
      const res = await recallSettlement(settlementId, recallReason.trim() || undefined)
      if (res.ok) {
        setConfirmingRecall(false)
        setRecallReason('')
        router.refresh()
      } else {
        setError(res.error ?? '오류 발생')
      }
    })
  }

  const showActions =
    canSendForConfirmation || canRequestEdit || canReopen || canPay || canRecall
  if (!showActions) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 space-y-3 max-w-2xl mx-auto shadow-lg">
      {error && <p className="text-xs text-red-500">{error}</p>}

      {confirmingRecall && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-sm text-amber-800">{RECALL_CONFIRM_COPY}</p>
          <input
            type="text"
            value={recallReason}
            onChange={e => setRecallReason(e.target.value)}
            placeholder="회수 사유 (선택)"
            className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <div className="flex gap-2">
            <button onClick={handleRecall} disabled={pending}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 disabled:opacity-40">
              {pending ? '처리 중…' : '회수 확인'}
            </button>
            <button onClick={() => { setConfirmingRecall(false); setRecallReason('') }} disabled={pending}
              className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40">
              취소
            </button>
          </div>
        </div>
      )}

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

        {canRecall && !confirmingRecall && (
          <button onClick={() => { setError(''); setConfirmingRecall(true) }} disabled={pending}
            className="px-4 py-2.5 border border-amber-300 text-amber-700 rounded-xl text-sm font-medium hover:bg-amber-50 disabled:opacity-40">
            회수
          </button>
        )}
      </div>
    </div>
  )
}
