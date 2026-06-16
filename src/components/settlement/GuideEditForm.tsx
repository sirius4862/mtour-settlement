'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { SettlementForm } from './SettlementForm'

type SettlementFormProps = ComponentProps<typeof SettlementForm>

const SettlementFormClient = dynamic(
  () => import('./SettlementForm').then((m) => m.SettlementForm),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col min-h-[50vh] pb-36">
        <div className="sticky top-14 z-20 bg-white border-b border-gray-100 px-4 py-3">
          <h1 className="font-semibold text-gray-800">정산서 수정</h1>
        </div>
        <div className="px-4 py-8 text-sm text-gray-400 text-center">양식 불러오는 중…</div>
      </div>
    ),
  },
)

/** Guide edit form — client-only to avoid Zustand/sessionStorage SSR hydration mismatch. */
export function GuideEditForm(props: SettlementFormProps) {
  return <SettlementFormClient {...props} guideCorrectionShellActive />
}
