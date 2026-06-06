'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { recallTourAssignment } from '@/lib/actions/tourActions'

const CONFIRM_COPY =
  '이 배정을 회수하면 해당 가이드 화면에서 이 행사는 사라지고, 더 이상 정산서를 작성하거나 제출할 수 없습니다. 배정을 회수할까요?'

export function RecallAssignmentButton({ tourId }: { tourId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    if (!window.confirm(CONFIRM_COPY)) return
    setError(null)
    startTransition(async () => {
      const result = await recallTourAssignment(tourId)
      if (!result.ok) {
        setError(result.error ?? '배정을 회수할 수 없습니다.')
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="px-3 py-1.5 border border-rose-200 text-rose-600 rounded-lg text-xs font-medium hover:bg-rose-50 disabled:opacity-50"
      >
        {pending ? '회수 중…' : '배정회수'}
      </button>
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  )
}
