'use client'

import { useState, useTransition } from 'react'
import { submitSettlement } from '@/lib/actions/settlementActions'

export function SubmitButton({ settlementId }: { settlementId: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState('')

  const handle = () => {
    if (!confirm('정산서를 제출하시겠습니까?\n제출 후에는 수정할 수 없습니다.')) return
    start(async () => {
      const res = await submitSettlement(settlementId)
      if (!res?.ok) setError(res?.error ?? '오류 발생')
    })
  }

  return (
    <div className="flex-1 space-y-1">
      {error && <p className="text-xs text-red-500 text-center">{error}</p>}
      <button onClick={handle} disabled={pending}
        className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
        {pending ? '제출 중…' : '정산서 제출'}
      </button>
    </div>
  )
}
