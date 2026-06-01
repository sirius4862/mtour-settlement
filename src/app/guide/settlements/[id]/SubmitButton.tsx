'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitSettlement } from '@/lib/actions/settlementActions'

const SUBMIT_TIMEOUT_MS = 45_000

export function SubmitButton({ settlementId }: { settlementId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const handle = async () => {
    if (!confirm('정산서를 제출하시겠습니까?\n제출 후에는 수정할 수 없습니다.')) return

    setError('')
    setPending(true)

    try {
      const res = await Promise.race([
        submitSettlement(settlementId),
        new Promise<{ ok: false; error: string }>((resolve) =>
          setTimeout(
            () => resolve({ ok: false, error: 'SUBMIT_TIMEOUT' }),
            SUBMIT_TIMEOUT_MS,
          ),
        ),
      ])

      if (res?.ok) {
        // Server action success: navigate to detail (never refresh inside a transition).
        router.push(`/guide/settlements/${settlementId}`)
        return
      }

      if (res?.error === 'SUBMIT_TIMEOUT') {
        setError('제출 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.')
        return
      }

      setError(res?.error?.trim() || '제출에 실패했습니다.')
    } catch {
      setError('제출 중 네트워크 오류가 발생했습니다.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex-1 space-y-1">
      {error && (
        <p className="text-xs text-red-600 text-center font-medium" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void handle()}
        disabled={pending}
        className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? '제출 중…' : '정산서 제출'}
      </button>
    </div>
  )
}
