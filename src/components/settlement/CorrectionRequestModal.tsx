'use client'



import {

  correctionFieldLabel,

  type CorrectionKind,

  type CorrectionSectionId,

  type CorrectionTarget,

} from '@/lib/settlement/correction-request-meta'

import { AdminCorrectionRequestFields } from './AdminCorrectionRequestFields'



export type CorrectionModalMode = 'contextual' | 'global'



export function CorrectionRequestModal({

  open,

  onClose,

  mode,

  target,

  globalSections,

  globalReason,

  onTargetChange,

  onGlobalSectionsChange,

  onGlobalReasonChange,

  onSubmit,

  pending = false,

  submitLabel = '가이드 수정 요청',

  error = null,

}: {

  open: boolean

  onClose: () => void

  mode: CorrectionModalMode

  target: CorrectionTarget

  globalSections: CorrectionSectionId[]

  globalReason: string

  onTargetChange: (next: CorrectionTarget) => void

  onGlobalSectionsChange: (sections: CorrectionSectionId[]) => void

  onGlobalReasonChange: (reason: string) => void

  onSubmit: () => void

  pending?: boolean

  submitLabel?: string

  error?: string | null

}) {

  if (!open) return null



  const isContextual = mode === 'contextual'

  const showProposed =

    isContextual &&

    (target.kind === 'amount_mismatch' || target.field != null)

  const proposedLabel = target.field

    ? `${correctionFieldLabel(target.field) ?? '값'} 제안 (선택)`

    : '제안 금액 (선택)'



  return (

    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">

      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-4 space-y-4 max-h-[90vh] overflow-y-auto">

        <div>

          <p className="text-sm font-semibold text-gray-800">가이드 수정 요청</p>

          <p className="text-xs text-gray-500 mt-1">

            {isContextual

              ? '선택한 섹션·항목에 대한 수정 사유를 가이드에게 전달합니다.'

              : '여러 섹션에 대한 수정 사유를 가이드에게 전달합니다.'}

          </p>

        </div>



        {isContextual ? (

          <AdminCorrectionRequestFields

            reason={target.reason}

            sections={[target.section]}

            onReasonChange={(reason) => onTargetChange({ ...target, reason })}

            onSectionsChange={() => {}}

            showSectionPicker={false}

            preselectedSection={target.section}

            preselectedRowLabel={target.rowLabel}

            preselectedKind={target.kind}

            proposed={target.proposed ?? ''}

            onProposedChange={(proposed) => onTargetChange({ ...target, proposed: proposed || null })}

            showProposed={showProposed}

            proposedLabel={proposedLabel}

            disabled={pending}

          />

        ) : (

          <AdminCorrectionRequestFields

            reason={globalReason}

            sections={globalSections}

            onReasonChange={onGlobalReasonChange}

            onSectionsChange={onGlobalSectionsChange}

            showSectionPicker

            disabled={pending}

          />

        )}



        {error?.trim() ? (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">

          <button

            type="button"

            onClick={onClose}

            disabled={pending}

            className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"

          >

            취소

          </button>

          <button

            type="button"

            onClick={onSubmit}

            disabled={pending}

            className="flex-1 py-3 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50"

          >

            {pending ? '처리 중…' : submitLabel}

          </button>

        </div>

      </div>

    </div>

  )

}



export function CorrectionSectionAction({

  onClick,

  disabled = false,

  compact = false,

}: {

  onClick: () => void

  disabled?: boolean

  compact?: boolean

}) {

  return (

    <button

      type="button"

      onClick={(e) => {

        e.stopPropagation()

        onClick()

      }}

      disabled={disabled}

      title="이 섹션 수정 요청"

      className={

        'shrink-0 inline-flex items-center gap-1 rounded-lg border border-red-200 text-red-700 ' +

        'hover:bg-red-50 disabled:opacity-40 ' +

        (compact ? 'px-2 py-1 text-[10px] font-semibold' : 'px-2.5 py-1.5 text-xs font-semibold')

      }

    >

      <span aria-hidden>⚠</span>

      {!compact && <span>이 섹션 수정 요청</span>}

    </button>

  )

}



export function CorrectionRowAction({

  onClick,

  disabled = false,

}: {

  onClick: () => void

  disabled?: boolean

}) {

  return (

    <button

      type="button"

      onClick={onClick}

      disabled={disabled}

      title="이 항목 수정 요청"

      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 text-[10px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"

    >

      <span aria-hidden>⚠</span>

      <span>이 항목 수정 요청</span>

    </button>

  )

}



export type { CorrectionSectionId }


