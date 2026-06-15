'use client'

import { useState, useTransition } from 'react'
import {
  reopenFinalConfirmedSettlementForAdminCorrection,
  reviewSettlement,
  saveAdminNoteBeforeConfirmation,
  sendForConfirmation,
} from '@/lib/actions/settlementActions'
import {
  CORRECTION_SECTIONS,
  emptyCorrectionTarget,
  encodeCorrectionNoteFromTargets,
  sectionsToTargets,
  SEND_FOR_CONFIRMATION_WARNING,
  validateCorrectionRequestInput,
  validateCorrectionTargets,
  type CorrectionSectionId,
  type CorrectionTarget,
} from '@/lib/settlement/correction-request-meta'
import { CorrectionRequestModal, type CorrectionModalMode } from '@/components/settlement/CorrectionRequestModal'
import { useRouter } from 'next/navigation'

interface Props {
  settlementId: string
  canSendForConfirmation: boolean
  canRequestEdit: boolean
  canReopenFinalConfirmed: boolean
  canPay: boolean
  currentAdminNote: string
}

const PAID_REOPEN_CONFIRM_COPY =
  '이 작업은 지급완료 상태를 해제하고 관리자 수정 상태로 되돌립니다. 계속하시겠습니까?'

export function ReviewPanel({
  settlementId,
  canSendForConfirmation,
  canRequestEdit,
  canReopenFinalConfirmed,
  canPay,
  currentAdminNote,
}: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [adminNote, setAdminNote] = useState(currentAdminNote)
  const [error, setError] = useState('')
  const [confirmingFinalReopen, setConfirmingFinalReopen] = useState(false)
  const [finalReopenReason, setFinalReopenReason] = useState('')
  const [showCorrectionModal, setShowCorrectionModal] = useState(false)
  const [correctionModalMode, setCorrectionModalMode] = useState<CorrectionModalMode>('contextual')
  const [correctionTarget, setCorrectionTarget] = useState<CorrectionTarget>(
    emptyCorrectionTarget('options'),
  )
  const [globalCorrectionSections, setGlobalCorrectionSections] = useState<CorrectionSectionId[]>([])
  const [globalCorrectionReason, setGlobalCorrectionReason] = useState('')

  const submitCorrection = (encoded: string) => {
    start(async () => {
      const res = await reviewSettlement({
        id: settlementId,
        action: 'request_edit',
        adminNote: encoded,
      })
      if (res.ok) {
        setShowCorrectionModal(false)
        router.refresh()
      } else {
        setError(res.error ?? '오류 발생')
      }
    })
  }

  const handleRequestEdit = () => {
    setError('')
    if (correctionModalMode === 'contextual') {
      const validation = validateCorrectionTargets([correctionTarget])
      if (!validation.ok) {
        setError(validation.error)
        return
      }
      submitCorrection(encodeCorrectionNoteFromTargets([correctionTarget]))
      return
    }

    const validation = validateCorrectionRequestInput(
      globalCorrectionSections,
      globalCorrectionReason,
    )
    if (!validation.ok) {
      setError(validation.error)
      return
    }
    submitCorrection(
      encodeCorrectionNoteFromTargets(
        sectionsToTargets(globalCorrectionSections, globalCorrectionReason),
      ),
    )
  }

  const openSectionCorrection = (sectionId: CorrectionSectionId) => {
    setError('')
    setCorrectionModalMode('contextual')
    setCorrectionTarget(emptyCorrectionTarget(sectionId, { kind: 'section' }))
    setShowCorrectionModal(true)
  }

  const openGlobalCorrection = () => {
    setError('')
    setCorrectionModalMode('global')
    setGlobalCorrectionSections([])
    setGlobalCorrectionReason('')
    setShowCorrectionModal(true)
  }

  const handleReview = (action: 'pay') => {
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
    if (!window.confirm(`${SEND_FOR_CONFIRMATION_WARNING}\n\n가이드에게 최종 확인을 요청하시겠습니까?`)) {
      return
    }

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

  const handleFinalReopen = () => {
    setError('')
    start(async () => {
      const res = await reopenFinalConfirmedSettlementForAdminCorrection(
        settlementId,
        finalReopenReason.trim() || undefined,
      )
      if (res.ok) {
        setConfirmingFinalReopen(false)
        setFinalReopenReason('')
        router.refresh()
      } else {
        setError(res.error ?? '오류 발생')
      }
    })
  }

  const showActions =
    canSendForConfirmation ||
    canRequestEdit ||
    canReopenFinalConfirmed ||
    canPay
  if (!showActions) return null

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 space-y-3 max-w-2xl mx-auto shadow-lg">
        {error && <p className="text-xs text-red-500">{error}</p>}

        {canReopenFinalConfirmed && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p className="text-sm font-semibold text-slate-800">정산 재오픈</p>
            <p className="text-xs leading-5 text-slate-600">
              지급완료된 정산서를 수정요청 상태로 되돌립니다.
              재오픈 후 가이드가 정산서를 수정·재제출할 수 있으며, 이후 기존 최종확인·지급 흐름을 따릅니다.
            </p>
            {confirmingFinalReopen ? (
              <>
                <p className="text-sm text-slate-700">{PAID_REOPEN_CONFIRM_COPY}</p>
                <input
                  type="text"
                  value={finalReopenReason}
                  onChange={(e) => setFinalReopenReason(e.target.value)}
                  placeholder="재오픈 사유 (선택)"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleFinalReopen}
                    disabled={pending}
                    className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-40"
                  >
                    {pending ? '처리 중…' : '정산 재오픈'}
                  </button>
                  <button
                    onClick={() => {
                      setConfirmingFinalReopen(false)
                      setFinalReopenReason('')
                    }}
                    disabled={pending}
                    className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40"
                  >
                    취소
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => {
                  setError('')
                  setConfirmingFinalReopen(true)
                }}
                disabled={pending}
                className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-40"
              >
                정산 재오픈
              </button>
            )}
          </div>
        )}

        {canRequestEdit && (
          <div className="rounded-xl border border-red-100 bg-red-50/40 p-3 space-y-2">
            <p className="text-sm font-semibold text-red-800">가이드 수정 요청</p>
            <p className="text-xs text-red-700">
              섹션별로 빠르게 수정 요청을 보내거나, 편집 화면에서 항목 단위로 지정할 수 있습니다.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CORRECTION_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  disabled={pending}
                  onClick={() => openSectionCorrection(section.id)}
                  className="px-2 py-1 rounded-lg text-[11px] font-medium border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40"
                >
                  {section.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {(canSendForConfirmation || canPay) && (
          <textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="관리자 메모 (선택)"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}

        <div className="flex gap-2 flex-wrap">
          {canRequestEdit && (
            <button
              onClick={openGlobalCorrection}
              disabled={pending}
              className="px-4 py-2.5 border border-red-200 text-red-700 rounded-xl text-sm font-semibold hover:bg-red-50 disabled:opacity-40"
            >
              {pending ? '처리 중…' : '기타 수정 요청'}
            </button>
          )}

          {canSendForConfirmation && (
            <button
              onClick={handleSendForConfirmation}
              disabled={pending}
              className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 disabled:opacity-40"
            >
              {pending ? '처리 중…' : '가이드 최종확인 요청'}
            </button>
          )}

          {canPay && (
            <button
              onClick={() => handleReview('pay')}
              disabled={pending}
              className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-40"
            >
              {pending ? '처리 중…' : '지급완료 처리'}
            </button>
          )}
        </div>
      </div>

      <CorrectionRequestModal
        open={showCorrectionModal && canRequestEdit}
        onClose={() => setShowCorrectionModal(false)}
        mode={correctionModalMode}
        target={correctionTarget}
        globalSections={globalCorrectionSections}
        globalReason={globalCorrectionReason}
        onTargetChange={setCorrectionTarget}
        onGlobalSectionsChange={setGlobalCorrectionSections}
        onGlobalReasonChange={setGlobalCorrectionReason}
        onSubmit={handleRequestEdit}
        pending={pending}
      />
    </>
  )
}
