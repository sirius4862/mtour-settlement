'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SettlementFull, Tour } from '@/types'
import { saveSettlementDraft, saveAdminSettlementEdits, sendForConfirmation, submitSettlement } from '@/lib/actions/settlementActions'
import { toDraftPayload, stateFromMock } from '@/lib/settlement/mappers'
import { sanitizeSettlementFullForGuide } from '@/lib/settlement/snapshot'
import { canAdminSendForConfirmation } from '@/lib/settlement/status-guards'
import { EXCEL_SECTIONS } from '@/lib/settlement/excel-sections'
import {
  shouldShowAdminSettlementSections,
} from '@/lib/settlement/settlement-form-sections'
import { resolveNewSettlementBinding } from '@/lib/settlement/new-settlement-binding'
import { submitCurrentSettlement } from '@/lib/settlement/submit-flow'
import {
  firstErrorSection,
  validateSettlementForm,
  validationErrors,
  type ValidationIssue,
} from '@/lib/settlement/validation'
import { activeRowCount, useSettlementFormStore } from '@/lib/stores/settlementFormStore'
import { useSettlementFormCalc } from '@/hooks/useSettlementFormCalc'
import { MockBadge } from '@/components/ui/FormPrimitives'
import { ValidationBanner } from './SectionHint'
import { SettlementAccordion, type AccordionSection } from './SettlementAccordion'
import { SectionSubtotal } from './SectionSubtotal'
import { SettlementFormFooter } from './SettlementFormFooter'
import { BasicInfoSection } from './sections/BasicInfoSection'
import {
  EntrancesSection,
  HotelsSection,
  MealsSection,
  OptionsSection,
  OthersSection,
  ShoppingSection,
} from './sections/LineItemSections'
import { CashReconciliationSection } from './sections/CashReconciliationSection'
import { TCSettlementSection, FinalAdjustmentsSection, GuideMegugiDailySection } from './sections/TCSettlementSection'
import { FinalSummarySection } from './sections/FinalSummarySection'
import { ReceiptsSection } from './sections/ReceiptsSection'
import type { SettlementFormRole } from '@/lib/settlement/field-ownership'
import { SettlementFormProvider, summaryAudienceFromRole } from './SettlementFormContext'

export type SettlementFormMode = 'new' | 'edit' | 'preview'

interface Props {
  tours: Tour[]
  guideName: string
  mode: SettlementFormMode
  initialFull?: SettlementFull
  /** New mode: assigned tour selected on the dashboard to bind/prefill. */
  initialTourId?: string
  /** Who may edit admin-owned fields. Defaults to guide. */
  formRole?: SettlementFormRole
  /** Admin review edit — save admin fields only, no submit. */
  adminEdit?: {
    backHref: string
  }
}

export function SettlementForm({ tours, guideName, mode, initialFull, initialTourId, formRole = 'guide', adminEdit }: Props) {
  const router = useRouter()
  const hydrated = useRef(false)
  const [pending, setPending] = useState(false)
  const [openSectionId, setOpenSectionId] = useState('basic')
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([])

  const hydrateFromFull = useSettlementFormStore((s) => s.hydrateFromFull)
  const resetNew = useSettlementFormStore((s) => s.resetNew)
  const setTour = useSettlementFormStore((s) => s.setTour)
  const setSaving = useSettlementFormStore((s) => s.setSaving)
  const markSaved = useSettlementFormStore((s) => s.markSaved)
  const mergeServerSync = useSettlementFormStore((s) => s.mergeServerSync)
  const setSaveError = useSettlementFormStore((s) => s.setSaveError)
  const receiptCount = useSettlementFormStore((s) => (s.receipts ?? []).length)

  const saveStatus = useSettlementFormStore((s) => s.saveStatus)
  const dirty = useSettlementFormStore((s) => s.dirty)
  const lastSavedAt = useSettlementFormStore((s) => s.lastSavedAt)
  const saveError = useSettlementFormStore((s) => s.saveError)
  const settlementStatus = useSettlementFormStore((s) => s.settlementStatus)
  const guideSubmitSnapshotId = useSettlementFormStore((s) => s.guideSubmitSnapshotId)
  const settlementRatio = useSettlementFormStore((s) => s.header.settlement_ratio)
  const hotelRowCount = useSettlementFormStore((s) => activeRowCount('hotels', s))
  const mealRowCount = useSettlementFormStore((s) => activeRowCount('meals', s))
  const entranceRowCount = useSettlementFormStore((s) => activeRowCount('entrances', s))
  const otherRowCount = useSettlementFormStore((s) => activeRowCount('others', s))
  const shoppingRowCount = useSettlementFormStore((s) => activeRowCount('shoppings', s))
  const optionRowCount = useSettlementFormStore((s) => activeRowCount('options', s))

  const calc = useSettlementFormCalc()
  const { sections } = calc
  const isPreview = mode === 'preview'
  const isAdminReview = !!adminEdit
  const role: SettlementFormRole = isPreview ? 'readOnly' : (isAdminReview ? 'admin' : formRole)
  const audience = summaryAudienceFromRole(role)
  const isAdmin = role === 'admin'
  const showSectionMeta = isAdmin || isAdminReview || isPreview
  const showAdminSections = shouldShowAdminSettlementSections(isAdmin, isAdminReview)
  const canSendForConfirmation = isAdminReview
    && !!settlementStatus
    && canAdminSendForConfirmation(settlementStatus)
    && !!guideSubmitSnapshotId

  useEffect(() => {
    if (hydrated.current) return

    const bootstrap = () => {
      hydrated.current = true

      if (mode === 'preview') {
        useSettlementFormStore.setState(stateFromMock(guideName))
        return
      }

      if (mode === 'edit' && initialFull) {
        // Server data must win over sessionStorage draft on edit reload
        useSettlementFormStore.persist.clearStorage()
        const fullForRole = formRole === 'guide'
          ? sanitizeSettlementFullForGuide(initialFull)
          : initialFull
        hydrateFromFull(fullForRole, guideName)
        return
      }

      const s = useSettlementFormStore.getState()
      const decision = resolveNewSettlementBinding(
        { settlementId: s.settlementId, tourId: s.tourId, guideName: s.guideName },
        initialTourId ?? null,
        guideName,
      )
      if (decision.reset) resetNew(guideName)
      if (decision.bindTourId) {
        const tour = tours.find((t) => t.id === decision.bindTourId)
        if (tour) setTour(tour)
      }
    }

    if (useSettlementFormStore.persist.hasHydrated()) {
      bootstrap()
      return
    }

    return useSettlementFormStore.persist.onFinishHydration(bootstrap)
  }, [mode, initialFull, guideName, formRole, initialTourId, tours, hydrateFromFull, resetNew, setTour])

  const runValidation = useCallback((intent: 'draft' | 'submit') => {
    const actor = isAdminReview ? 'admin' : 'guide'
    const issues = validateSettlementForm(useSettlementFormStore.getState(), intent, actor)
    setValidationIssues(issues)
    const section = firstErrorSection(issues)
    if (section) setOpenSectionId(section)
    const errors = validationErrors(issues)
    return { ok: errors.length === 0, errors }
  }, [isAdminReview])

  const handleSave = useCallback(async (options?: { managePending?: boolean }): Promise<boolean> => {
    if (isPreview) return false

    const { ok, errors } = runValidation('draft')
    if (!ok) {
      setSaveError(errors[0]?.message ?? '입력 내용을 확인해주세요.')
      return false
    }

    const state = useSettlementFormStore.getState()
    const managePending = options?.managePending !== false
    if (managePending) setPending(true)
    setSaving()

    try {
      const payload = toDraftPayload(state)

      if (isAdminReview) {
        const result = await saveAdminSettlementEdits(payload)
        if (result.ok) {
          markSaved(state.settlementId!)
          if (result.sync) mergeServerSync(result.sync)
          return true
        }
        setSaveError(result.error ?? '저장 실패')
        return false
      }

      const result = await saveSettlementDraft(payload)

      if (result.ok && result.id) {
        markSaved(result.id)
        if (result.sync) mergeServerSync(result.sync)
        return true
      }

      setSaveError(result.error ?? '저장 실패')
      return false
    } catch {
      setSaveError('네트워크 오류가 발생했습니다.')
      return false
    } finally {
      if (managePending) setPending(false)
    }
  }, [isPreview, isAdminReview, runValidation, setSaving, markSaved, mergeServerSync, setSaveError])

  const handleSendForConfirmation = useCallback(async () => {
    if (isPreview || !isAdminReview || !adminEdit) return

    if (!canSendForConfirmation) {
      setSaveError('가이드 제출 스냅샷이 없어 확인 요청을 보낼 수 없습니다.')
      return
    }

    if (!window.confirm('변경사항을 저장한 뒤 가이드에게 확인을 요청하시겠습니까?')) {
      return
    }

    const saved = await handleSave()
    if (!saved) return

    const id = useSettlementFormStore.getState().settlementId
    if (!id) return

    setPending(true)
    try {
      const result = await sendForConfirmation(id)
      if (result.ok) {
        router.push(adminEdit.backHref)
        return
      }
      setSaveError(result.error ?? '가이드 검토 요청 실패')
    } catch {
      setSaveError('네트워크 오류가 발생했습니다.')
    } finally {
      setPending(false)
    }
  }, [isPreview, isAdminReview, adminEdit, canSendForConfirmation, handleSave, router, setSaveError])

  const handleSubmit = useCallback(async () => {
    if (isPreview || isAdminReview) return

    const { ok, errors } = runValidation('submit')
    if (!ok) {
      setSaveError(errors[0]?.message ?? '제출 전 필수 항목을 확인해주세요.')
      return
    }

    if (
      !window.confirm(
        '변경 내용을 저장한 뒤 정산서를 제출합니다.\n제출 후에는 수정할 수 없습니다. 계속하시겠습니까?',
      )
    ) {
      return
    }

    setPending(true)
    try {
      const result = await submitCurrentSettlement({
        getSettlementId: () => useSettlementFormStore.getState().settlementId,
        saveDraft: () => handleSave({ managePending: false }),
        submitWithDraft: (id) =>
          submitSettlement(id, toDraftPayload(useSettlementFormStore.getState())),
        submitSaved: (id) => submitSettlement(id),
      })

      if (result.ok) {
        const id = useSettlementFormStore.getState().settlementId
        router.push(`/guide/settlements/${id}`)
        return
      }

      setSaveError(result.error ?? '제출 실패')
    } catch {
      setSaveError('네트워크 오류가 발생했습니다.')
    } finally {
      setPending(false)
    }
  }, [isPreview, isAdminReview, handleSave, router, runValidation, setSaveError])

  const title =
    isAdminReview ? '관리자 검토 수정'
    : mode === 'edit' ? '정산서 수정'
    : mode === 'preview' ? '정산서 (미리보기)'
    : '새 정산서'

  const backHref = isAdminReview ? adminEdit!.backHref : '/guide'

  const accordionSections: AccordionSection[] = [
    {
      id: 'basic',
      title: '기본정보',
      excelRows: EXCEL_SECTIONS.basic.rows,
      children: (
        <BasicInfoSection
          tours={tours}
          advanceUsd={sections.cash.advance_usd}
          readOnlyTour={mode === 'edit' || isPreview}
        />
      ),
    },
    {
      id: 'hotels',
      title: '호텔',
      excelRows: EXCEL_SECTIONS.hotels.rows,
      preview: isAdmin ? sections.hotels.company_total_usd : sections.hotels.guide_total_usd,
      badge: `${hotelRowCount}행`,
      children: <HotelsSection />,
      footer: (
        <SectionSubtotal
          sticky
          fields={
            isAdmin
              ? [sections.hotels.company_total_usd, sections.hotels.guide_total_usd]
              : [sections.hotels.guide_total_usd]
          }
        />
      ),
    },
    {
      id: 'meals',
      title: '식사',
      excelRows: EXCEL_SECTIONS.meals.rows,
      preview: sections.meals.total_usd,
      badge: `${mealRowCount}행`,
      children: <MealsSection />,
      footer: (
        <SectionSubtotal sticky fields={[sections.meals.total_vnd, sections.meals.total_usd]} />
      ),
    },
    {
      id: 'entrances',
      title: '입장료',
      excelRows: EXCEL_SECTIONS.entrances.rows,
      preview: sections.entrances.total_usd,
      badge: `${entranceRowCount}행`,
      children: <EntrancesSection />,
      footer: (
        <SectionSubtotal
          sticky
          fields={[sections.entrances.total_vnd, sections.entrances.total_usd]}
        />
      ),
    },
    {
      id: 'others',
      title: '기타지출',
      excelRows: EXCEL_SECTIONS.others.rows,
      preview: sections.others.combined_usd,
      badge: `${otherRowCount}행`,
      children: <OthersSection />,
      footer: (
        <SectionSubtotal
          sticky
          fields={[
            sections.others.total_usd,
            sections.others.total_vnd,
            sections.others.combined_usd,
          ]}
        />
      ),
    },
    {
      id: 'shopping',
      title: '쇼핑',
      excelRows: EXCEL_SECTIONS.shopping.rows,
      preview: sections.shopping.com_usd,
      badge: `${shoppingRowCount}행`,
      children: <ShoppingSection />,
      footer: (
        <SectionSubtotal
          sticky
          fields={
            isAdmin
              ? [sections.shopping.sale_usd, sections.shopping.com_usd, sections.shopping.kb_usd]
              : [sections.shopping.sale_usd, sections.shopping.com_usd]
          }
        />
      ),
    },
    {
      id: 'options',
      title: '옵션',
      excelRows: EXCEL_SECTIONS.options.rows,
      preview: sections.options.com_usd,
      badge: `${optionRowCount}행`,
      children: <OptionsSection />,
      footer: (
        <SectionSubtotal
          sticky
          fields={
            isAdmin
              ? [sections.options.com_usd, sections.options.extra_vehicle_usd]
              : [sections.options.com_usd]
          }
        />
      ),
    },
    {
      id: 'cash',
      title: '입금 정리',
      excelRows: EXCEL_SECTIONS.cash.rows,
      preview: sections.cash.company_deposit_usd,
      children: <CashReconciliationSection />,
      footer: (
        <SectionSubtotal
          sticky
          fields={[
            sections.cash.income_total_usd,
            sections.cash.guide_expense_deposit_usd,
            sections.cash.company_deposit_usd,
          ]}
        />
      ),
    },
    {
      id: 'tc',
      title: 'T/C 정산',
      excelRows: EXCEL_SECTIONS.tc.rows,
      children: <TCSettlementSection />,
    },
    ...(!showAdminSections
      ? ([
          {
            id: 'guide-adjustments',
            title: '메꾸기·가이드 일비',
            excelRows: 'R80, R82',
            children: <GuideMegugiDailySection />,
          },
        ] satisfies AccordionSection[])
      : []),
    ...(showAdminSections
      ? ([
          {
            id: 'adjustments',
            title: '회사 입력 항목',
            excelRows: EXCEL_SECTIONS.adjustments.rows,
            preview: calc.summary.balance_usd,
            children: <FinalAdjustmentsSection />,
          },
          {
            id: 'summary',
            title: '정산 요약',
            excelRows: EXCEL_SECTIONS.summary.rows,
            preview: calc.summary.guide_payout_usd,
            children: (
              <FinalSummarySection
                calc={calc}
                settlementRatio={settlementRatio}
                audience={audience}
              />
            ),
          },
        ] satisfies AccordionSection[])
      : []),
    {
      id: 'receipts',
      title: '영수증',
      badge: receiptCount > 0 ? `${receiptCount}장` : undefined,
      children: <ReceiptsSection readOnly={isPreview || isAdminReview} />,
    },
  ]

  return (
    <SettlementFormProvider role={role} adminReviewEdit={isAdminReview}>
    <div className="flex flex-col min-h-screen pb-36">
      <div className="sticky top-14 z-20 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="text-gray-500 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label={isAdminReview ? '상세로' : '홈으로'}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 15L7.5 10l5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-gray-800 truncate">{title}</h1>
              {isPreview && <MockBadge />}
            </div>
            {showSectionMeta && (
              <p className="text-[11px] text-gray-400">
                {isPreview ? 'mock 데이터 · calcSettlement() live'
                  : isAdminReview ? '회사 전용 필드만 저장 · calcSettlement()'
                  : 'Excel 양식 · calcSettlement()'}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-4">
        {!isPreview && (
          <ValidationBanner
            issues={validationIssues}
            onDismiss={() => setValidationIssues([])}
          />
        )}
        <SettlementAccordion
          sections={accordionSections}
          openId={openSectionId}
          onOpenIdChange={setOpenSectionId}
          showSectionMeta={showSectionMeta}
        />
      </div>

      {isPreview ? (
        <div className="fixed bottom-16 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-lg">
          <div className="max-w-lg mx-auto px-4 py-4 text-center text-sm text-gray-500">
            미리보기 모드 — 저장·제출 불가
          </div>
        </div>
      ) : (
        <SettlementFormFooter
          calc={calc}
          companyDeposit={sections.cash.company_deposit_usd}
          audience={audience}
          saveStatus={saveStatus}
          dirty={dirty}
          lastSavedAt={lastSavedAt}
          saveError={saveError}
          onSave={handleSave}
          onSubmit={handleSubmit}
          onSendForConfirmation={isAdminReview ? handleSendForConfirmation : undefined}
          pending={pending}
          hideSubmit={isAdminReview}
          showSendForConfirmation={canSendForConfirmation}
          saveLabel="임시저장"
          submitLabel="저장 후 제출"
          sendForConfirmationLabel="가이드 검토 요청"
        />
      )}
    </div>
    </SettlementFormProvider>
  )
}
