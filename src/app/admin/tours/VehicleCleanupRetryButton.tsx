'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { recallTourAssignment } from '@/lib/actions/tourActions'

const CONFIRM_COPY =
  '차량 리포트 정리를 다시 시도합니다. 배정 회수 상태는 변경하지 않습니다. 계속할까요?'

const SUCCESS_COPY = '차량 리포트 정리가 완료되었습니다.'

export function VehicleCleanupRetryButton({ tourId }: { tourId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function handleClick() {
    if (!window.confirm(CONFIRM_COPY)) return
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const result = await recallTourAssignment(tourId)
      if (!result.ok) {
        setError(result.error ?? '차량 리포트 정리에 실패했습니다.')
        return
      }
      setSuccess(SUCCESS_COPY)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="px-3 py-1.5 border border-amber-200 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-50 disabled:opacity-50"
      >
        {pending ? '정리 중…' : '차량 리포트 정리 재시도'}
      </button>
      {success && <p className="text-[11px] text-emerald-600">{success}</p>}
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  )
}
