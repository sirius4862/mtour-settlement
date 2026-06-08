'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { submitGuideVehicleReportCheck, type GuideVehicleCheckRecord } from '@/lib/actions/vehicleGuideActions'
import {
  GUIDE_ISSUE_NOTE_MAX,
  guideCheckDetailLabel,
  type GuideCheckStatus,
} from '@/lib/vehicle/guide-check'

interface Props {
  tourId: string
  check: GuideVehicleCheckRecord | null
}

const cardClass = 'rounded-[22px] border border-[#E9DED2] bg-white p-4 shadow-[0_4px_18px_rgba(43,33,24,0.035)]'

function formatCheckedAt(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
}

export function GuideVehicleCheckForm({ tourId, check }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [status, setStatus] = useState<GuideCheckStatus>('no_issue')
  const [note, setNote] = useState('')

  // ── Already checked → read-only result ────────────────────────────────────
  if (check) {
    const checkedAt = formatCheckedAt(check.checked_at)
    const isIssue = check.check_status === 'issue_reported'
    return (
      <section className={cardClass}>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#2B2118]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#2F7D5A]" aria-hidden="true" />
          가이드 확인 완료
        </h2>
        <div className="space-y-2">
          <span
            className={`inline-flex h-7 items-center justify-center rounded-full border px-3 text-xs font-semibold ${
              isIssue
                ? 'border-[#F7CFC9] bg-[#FCEAE7] text-[#B42318]'
                : 'border-[#CFE5D8] bg-[#EAF4EE] text-[#2F7D5A]'
            }`}
          >
            {guideCheckDetailLabel(check.check_status)}
          </span>
          {isIssue && check.issue_note && (
            <div className="rounded-xl border border-[#E9DED2] bg-[#FFFDF9] px-3 py-2">
              <p className="text-xs font-medium text-[#8B7B6E]">메모</p>
              <p className="mt-0.5 text-sm text-[#2B2118] whitespace-pre-wrap">{check.issue_note}</p>
            </div>
          )}
          {checkedAt && <p className="text-xs text-[#8B7B6E]">확인일시: {checkedAt}</p>}
        </div>
      </section>
    )
  }

  // ── Not yet checked → one-time confirmation form ──────────────────────────
  const handleSubmit = () => {
    setError('')
    startTransition(async () => {
      const result = await submitGuideVehicleReportCheck(tourId, {
        check_status: status,
        issue_note: status === 'issue_reported' ? note : '',
      })
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.error ?? '확인 저장에 실패했습니다.')
      }
    })
  }

  return (
    <section className={cardClass}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#2B2118]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#F37021]" aria-hidden="true" />
        이상 여부 확인
      </h2>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setStatus('no_issue')}
          className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
            status === 'no_issue'
              ? 'border-[#2F7D5A] bg-[#EAF4EE] text-[#2F7D5A]'
              : 'border-[#E9DED2] bg-white text-[#8B7B6E] hover:border-[#2F7D5A]/50'
          }`}
        >
          이상없음
        </button>
        <button
          type="button"
          onClick={() => setStatus('issue_reported')}
          className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
            status === 'issue_reported'
              ? 'border-[#B42318] bg-[#FCEAE7] text-[#B42318]'
              : 'border-[#E9DED2] bg-white text-[#8B7B6E] hover:border-[#B42318]/50'
          }`}
        >
          이상있음
        </button>
      </div>

      {status === 'issue_reported' && (
        <textarea
          className="mt-3 min-h-24 w-full rounded-xl border border-[#E9DED2] bg-white px-3 py-2.5 text-sm text-[#2B2118] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
          value={note}
          maxLength={GUIDE_ISSUE_NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          placeholder="이상 내용을 입력해주세요. (선택)"
        />
      )}

      {error && (
        <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      <p className="mt-3 text-xs text-[#8B7B6E]">한 번 확인하면 수정할 수 없습니다.</p>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending}
        className="mt-2 w-full rounded-xl bg-[#F37021] py-3 text-sm font-semibold text-white hover:bg-[#D85F18] disabled:opacity-50"
      >
        {pending ? '처리 중…' : '확인 완료'}
      </button>
    </section>
  )
}
