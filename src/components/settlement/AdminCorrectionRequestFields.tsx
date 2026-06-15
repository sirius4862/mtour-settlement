'use client'



import {
  CORRECTION_SECTIONS,
  getCorrectionSectionLabel,
  type CorrectionKind,
  type CorrectionSectionId,
  type CorrectionTarget,
} from '@/lib/settlement/correction-request-meta'



export function AdminCorrectionRequestFields({

  reason,

  sections,

  onReasonChange,

  onSectionsChange,

  disabled = false,

  showSectionPicker = true,

  preselectedSection,

  preselectedRowLabel,

  preselectedKind,

  proposed,

  onProposedChange,

  showProposed = false,

  proposedLabel = '제안 금액 (선택)',

}: {

  reason: string

  sections: CorrectionSectionId[]

  onReasonChange: (value: string) => void

  onSectionsChange: (value: CorrectionSectionId[]) => void

  disabled?: boolean

  showSectionPicker?: boolean

  preselectedSection?: CorrectionSectionId

  preselectedRowLabel?: string | null

  preselectedKind?: CorrectionKind

  proposed?: string

  onProposedChange?: (value: string) => void

  showProposed?: boolean

  proposedLabel?: string

}) {

  const toggleSection = (id: CorrectionSectionId) => {

    if (disabled) return

    if (sections.includes(id)) {

      onSectionsChange(sections.filter((s) => s !== id))

      return

    }

    onSectionsChange([...sections, id])

  }



  const kindLabel =

    preselectedKind === 'section_missing'

      ? '섹션 누락 확인'

      : preselectedKind === 'amount_mismatch'

        ? '금액 수정 요청'

        : preselectedKind === 'row'

          ? '항목 수정 요청'

          : preselectedRowLabel

            ? '항목 수정 요청'

            : '섹션 수정 요청'



  return (

    <div className="space-y-3">

      {(preselectedSection || preselectedRowLabel) && (

        <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 space-y-1">

          <p className="text-[10px] font-semibold text-gray-500 uppercase">{kindLabel}</p>

          {preselectedSection && (

            <p className="text-sm text-gray-800">

              섹션: <span className="font-semibold">{getCorrectionSectionLabel(preselectedSection)}</span>

            </p>

          )}

          {preselectedRowLabel && (

            <p className="text-sm text-gray-800">

              항목: <span className="font-semibold">{preselectedRowLabel}</span>

            </p>

          )}

        </div>

      )}



      {showSectionPicker && (

        <div>

          <p className="text-xs font-semibold text-gray-700 mb-1.5">

            수정이 필요한 섹션 <span className="text-red-600">*</span>

          </p>

          <div className="flex flex-wrap gap-2">

            {CORRECTION_SECTIONS.map((section) => {

              const selected = sections.includes(section.id)

              return (

                <button

                  key={section.id}

                  type="button"

                  disabled={disabled}

                  onClick={() => toggleSection(section.id)}

                  className={

                    'px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ' +

                    (selected

                      ? 'bg-red-50 border-red-300 text-red-700'

                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')

                  }

                >

                  {section.label}

                </button>

              )

            })}

          </div>

        </div>

      )}



      <div>

        <label className="text-xs font-semibold text-gray-700 mb-1.5 block">

          수정요청 사유 <span className="text-red-600">*</span>

        </label>

        <textarea

          value={reason}

          onChange={(e) => onReasonChange(e.target.value)}

          disabled={disabled}

          placeholder="가이드에게 전달할 수정 사유를 입력하세요"

          rows={3}

          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-50"

        />

      </div>



      {showProposed && onProposedChange && (

        <div>

          <label className="text-xs font-semibold text-gray-700 mb-1.5 block">

            {proposedLabel}

          </label>

          <input

            type="text"

            inputMode="decimal"

            value={proposed ?? ''}

            onChange={(e) => onProposedChange(e.target.value)}

            disabled={disabled}

            placeholder="예상 금액 또는 값"

            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-50"

          />

        </div>

      )}

    </div>

  )

}

export type { CorrectionTarget }


