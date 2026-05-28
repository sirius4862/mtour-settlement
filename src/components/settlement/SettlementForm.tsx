'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SettlementFull, Tour } from '@/types'
import { saveSettlementDraft, submitSettlement } from '@/lib/actions/settlementActions'
import { toDraftPayload, stateFromMock } from '@/lib/settlement/mappers'
import { activeRowCount, useSettlementFormStore } from '@/lib/stores/settlementFormStore'
import { useSettlementFormCalc } from '@/hooks/useSettlementFormCalc'
import { MockBadge } from '@/components/ui/FormPrimitives'
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
import { TCSettlementSection, FinalAdjustmentsSection } from './sections/TCSettlementSection'
import { FinalSummarySection } from './sections/FinalSummarySection'
import { ReceiptsSection } from './sections/ReceiptsSection'

export type SettlementFormMode = 'new' | 'edit' | 'preview'

interface Props {
  tours: Tour[]
  guideName: string
  mode: SettlementFormMode
  initialFull?: SettlementFull
}

export function SettlementForm({ tours, guideName, mode, initialFull }: Props) {
  const router = useRouter()
  const hydrated = useRef(false)
  const [pending, setPending] = useState(false)

  const hydrateFromFull = useSettlementFormStore((s) => s.hydrateFromFull)
  const resetNew = useSettlementFormStore((s) => s.resetNew)
  const setSaving = useSettlementFormStore((s) => s.setSaving)
  const markSaved = useSettlementFormStore((s) => s.markSaved)
  const mergeServerSync = useSettlementFormStore((s) => s.mergeServerSync)
  const setSaveError = useSettlementFormStore((s) => s.setSaveError)
  const receiptCount = useSettlementFormStore((s) => (s.receipts ?? []).length)

  const saveStatus = useSettlementFormStore((s) => s.saveStatus)
  const dirty = useSettlementFormStore((s) => s.dirty)
  const lastSavedAt = useSettlementFormStore((s) => s.lastSavedAt)
  const saveError = useSettlementFormStore((s) => s.saveError)
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

  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true

    if (mode === 'preview') {
      useSettlementFormStore.setState(stateFromMock(guideName))
      return
    }

    if (mode === 'edit' && initialFull) {
      hydrateFromFull(initialFull, guideName)
      return
    }

    const s = useSettlementFormStore.getState()
    if (s.guideName !== guideName) {
      resetNew(guideName)
    }
  }, [mode, initialFull, guideName, hydrateFromFull, resetNew])

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (isPreview) return false

    const state = useSettlementFormStore.getState()
    if (!state.tourId) {
      setSaveError('투어를 선택해주세요.')
      return false
    }

    setPending(true)
    setSaving()

    try {
      const payload = toDraftPayload(state)
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
      setPending(false)
    }
  }, [isPreview, setSaving, markSaved, mergeServerSync, setSaveError])

  const handleSubmit = useCallback(async () => {
    if (isPreview) return

    const saved = await handleSave()
    if (!saved) return

    const id = useSettlementFormStore.getState().settlementId
    if (!id) return

    setPending(true)
    try {
      const result = await submitSettlement(id)
      if (result.ok) {
        router.push(`/guide/settlements/${id}`)
      } else {
        setSaveError(result.error ?? '제출 실패')
      }
    } finally {
      setPending(false)
    }
  }, [isPreview, handleSave, router, setSaveError])

  const title =
    mode === 'edit' ? '정산서 수정'
    : mode === 'preview' ? '정산서 (미리보기)'
    : '새 정산서'

  const accordionSections: AccordionSection[] = [
    {
      id: 'basic',
      title: '기본정보',
      excelRows: 'R1–4, Q2, A76',
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
      excelRows: 'R6–12',
      preview: sections.hotels.company_total_usd,
      badge: `${hotelRowCount}행`,
      children: <HotelsSection />,
      footer: (
        <SectionSubtotal
          sticky
          fields={[sections.hotels.company_total_usd, sections.hotels.guide_total_usd]}
        />
      ),
    },
    {
      id: 'meals',
      title: '식사',
      excelRows: 'R14–25',
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
      excelRows: 'R27–38',
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
      excelRows: 'R40–53',
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
      excelRows: 'R55–72 (B–H)',
      preview: sections.shopping.com_usd,
      badge: `${shoppingRowCount}행`,
      children: <ShoppingSection />,
      footer: (
        <SectionSubtotal
          sticky
          fields={[
            sections.shopping.sale_usd,
            sections.shopping.com_usd,
            sections.shopping.kb_usd,
          ]}
        />
      ),
    },
    {
      id: 'options',
      title: '옵션',
      excelRows: 'R55–73 (J–S)',
      preview: sections.options.com_usd,
      badge: `${optionRowCount}행`,
      children: <OptionsSection />,
      footer: (
        <SectionSubtotal
          sticky
          fields={[sections.options.com_usd, sections.options.extra_vehicle_usd]}
        />
      ),
    },
    {
      id: 'cash',
      title: '입금 정리',
      excelRows: 'R74–76',
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
      excelRows: 'H83, J83',
      children: <TCSettlementSection />,
    },
    {
      id: 'adjustments',
      title: '정산 조정',
      excelRows: 'O79–81, R77, R80, R82',
      preview: calc.summary.balance_usd,
      children: <FinalAdjustmentsSection />,
    },
    {
      id: 'summary',
      title: '정산내역 (최종)',
      excelRows: 'R77–R87',
      preview: calc.summary.guide_settlement_usd,
      children: (
        <FinalSummarySection calc={calc} settlementRatio={settlementRatio} />
      ),
    },
    {
      id: 'receipts',
      title: '영수증',
      badge: receiptCount > 0 ? `${receiptCount}장` : undefined,
      children: <ReceiptsSection readOnly={isPreview} />,
    },
  ]

  return (
    <div className="flex flex-col min-h-screen pb-36">
      <div className="sticky top-14 z-20 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-gray-500 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="뒤로"
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
            <p className="text-[11px] text-gray-400">
              {isPreview ? 'mock 데이터 · calcSettlement() live' : 'Excel 양식 · calcSettlement()'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-4">
        <SettlementAccordion sections={accordionSections} />
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
          saveStatus={saveStatus}
          dirty={dirty}
          lastSavedAt={lastSavedAt}
          saveError={saveError}
          onSave={handleSave}
          onSubmit={handleSubmit}
          pending={pending}
        />
      )}
    </div>
  )
}
