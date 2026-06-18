'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SettlementFull, Tour, UserRole } from '@/types'
import { saveSettlementDraft, saveAdminSettlementEdits, sendForConfirmation, submitSettlement, reviewSettlement } from '@/lib/actions/settlementActions'
import { toDraftPayload, stateFromMock } from '@/lib/settlement/mappers'
import {
  assertAdminSendForConfirmation,
  canAdminRequestEditOnSettlement,
  canAdminSendForConfirmationOnSettlement,
} from '@/lib/settlement/status-guards'
import {
  emptyCorrectionTarget,
  encodeCorrectionNoteFromTargets,
  correctionTargetMatchesRow,
  getCorrectionSectionDefaultMessage,
  parseCorrectionNote,
  sectionAttentionMessage,
  sectionsToTargets,
  SEND_FOR_CONFIRMATION_WARNING,
  validateCorrectionRequestInput,
  validateCorrectionTargets,
  type CorrectionSectionId,
  type CorrectionTarget,
} from '@/lib/settlement/correction-request-meta'
import { EXCEL_SECTIONS } from '@/lib/settlement/excel-sections'
import {
  shouldShowAdminSettlementSections,
} from '@/lib/settlement/settlement-form-sections'
import { applyDraftSaveResult } from '@/lib/settlement/draft-save-flow'
import {
  canProceedToSubmit,
  hasActiveLocalDraft,
  shouldNavigateNewSettlementToEdit,
  shouldSkipNewFormBootstrapReset,
} from '@/lib/settlement/save-integrity'
import {
  applyEditFormBootstrapPlan,
  applyAdminServerWinsState,
  isAdminEditHydrationBroken,
  resolveEditFormBootstrap,
  runPersistAwareBootstrap,
  shouldAdminEditRebootstrap,
} from '@/lib/settlement/settlement-form-edit-bootstrap'
import { resolveNewSettlementBinding } from '@/lib/settlement/new-settlement-binding'
import { submitCurrentSettlement } from '@/lib/settlement/submit-flow'
import {
  logSaveDebugTimings,
  logSubmitFlowAction,
  type SettlementFormAction,
} from '@/lib/settlement/submit-flow-diagnostics'
import type { SaveDebugTimings } from '@/lib/settlement/save-timing-debug'
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
import { SettlementFormProvider, summaryAudienceFromRole, type GuideRowCorrectionHighlight } from './SettlementFormContext'
import { CorrectionRequestModal, type CorrectionModalMode } from './CorrectionRequestModal'
import { GuideCorrectionBanner } from './GuideCorrectionBanner'
import {
  GUIDE_CORRECTION_JUMP_EVENT,
  parseCorrectionSectionFromHash,
  type GuideCorrectionJumpDetail,
} from '@/lib/settlement/guide-correction-jump'

export type SettlementFormMode = 'new' | 'edit' | 'preview'

type CorrectionRowRef = { clientId: string; id?: string | null; label?: string | null }

/** Stable row refs from server-loaded settlement — SSR/hydration-safe for correction display. */
function correctionRowCollectionsFromFull(full: SettlementFull): Record<string, CorrectionRowRef[]> {
  return {
    hotels: full.hotels.map((r) => ({
      clientId: r.id,
      id: r.id,
      label: r.hotel_name,
    })),
    meals: full.meals.map((r) => ({
      clientId: r.id,
      id: r.id,
      label: r.restaurant_name,
    })),
    entrances: full.entrances.map((r) => ({
      clientId: r.id,
      id: r.id,
      label: r.attraction_name,
    })),
    others: full.others.map((r) => ({
      clientId: r.id,
      id: r.id,
      label: r.description,
    })),
    shopping: full.shoppings.map((r) => ({
      clientId: r.id,
      id: r.id,
      label: r.shop_name,
    })),
    options: full.options
      .filter((r) => r.is_extra_vehicle !== true)
      .map((r) => ({
        clientId: r.id,
        id: r.id,
        label: r.option_name,
      })),
  }
}

function buildGuideRowHighlights(
  targets: CorrectionTarget[],
  rowCollections: Record<string, CorrectionRowRef[]>,
): Map<string, GuideRowCorrectionHighlight> {
  const map = new Map<string, GuideRowCorrectionHighlight>()
  for (const target of targets) {
    if (target.kind !== 'row' && target.kind !== 'amount_mismatch') continue
    const rows = rowCollections[target.section] ?? []
    const matched = rows.find((row) => correctionTargetMatchesRow(target, row))
    if (matched) {
      map.set(matched.clientId, {
        message: target.reason,
        field: target.field,
        proposed: target.proposed,
      })
    }
  }
  return map
}

function correctionRowCollectionsFromStore(): Record<string, CorrectionRowRef[]> {
  const state = useSettlementFormStore.getState()
  return {
    hotels: state.hotels.filter((r) => !r.deleted).map((r) => ({
      clientId: r.clientId,
      id: r.id,
      label: r.hotel_name,
    })),
    meals: state.meals.filter((r) => !r.deleted).map((r) => ({
      clientId: r.clientId,
      id: r.id,
      label: r.restaurant_name,
    })),
    entrances: state.entrances.filter((r) => !r.deleted).map((r) => ({
      clientId: r.clientId,
      id: r.id,
      label: r.attraction_name,
    })),
    others: state.others.filter((r) => !r.deleted).map((r) => ({
      clientId: r.clientId,
      id: r.id,
      label: r.description,
    })),
    shopping: state.shoppings.filter((r) => !r.deleted).map((r) => ({
      clientId: r.clientId,
      id: r.id,
      label: r.shop_name,
    })),
    options: state.options
      .filter((r) => !r.deleted && r.is_extra_vehicle !== true)
      .map((r) => ({
        clientId: r.clientId,
        id: r.id,
        label: r.option_name,
      })),
  }
}

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
    actorRole?: UserRole
  }
  /** Guide edit: banner rendered outside in GuideCorrectionStableShell. */
  guideCorrectionShellActive?: boolean
}

export function SettlementForm({
  tours,
  guideName,
  mode,
  initialFull,
  initialTourId,
  formRole = 'guide',
  adminEdit,
  guideCorrectionShellActive = false,
}: Props) {
  const router = useRouter()
  const saveInFlightRef = useRef(false)
  const [pendingAction, setPendingAction] = useState<'save' | 'send' | 'submit' | 'request_edit' | null>(null)
  const [openSectionId, setOpenSectionId] = useState('basic')
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([])
  const [showCorrectionModal, setShowCorrectionModal] = useState(false)
  const [correctionModalMode, setCorrectionModalMode] = useState<CorrectionModalMode>('contextual')
  const [correctionTarget, setCorrectionTarget] = useState<CorrectionTarget>(
    emptyCorrectionTarget('options'),
  )
  const [globalCorrectionSections, setGlobalCorrectionSections] = useState<CorrectionSectionId[]>([])
  const [globalCorrectionReason, setGlobalCorrectionReason] = useState('')
  const [correctionModalError, setCorrectionModalError] = useState('')
  const [correctionJumpIndex, setCorrectionJumpIndex] = useState(0)
  const [activeJumpClientId, setActiveJumpClientId] = useState<string | null>(null)
  const correctionAutoExpanded = useRef(false)
  const correctionJumpPending = useRef<{ sectionId: string; clientId: string | null } | null>(null)
  const [correctionHighlightReady, setCorrectionHighlightReady] = useState(!guideCorrectionShellActive)

  const hydrateFromFull = useSettlementFormStore((s) => s.hydrateFromFull)
  const resetNew = useSettlementFormStore((s) => s.resetNew)
  const bindTourMetadata = useSettlementFormStore((s) => s.bindTourMetadata)
  const setSaving = useSettlementFormStore((s) => s.setSaving)
  const bindSettlementId = useSettlementFormStore((s) => s.bindSettlementId)
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
  const isExistingSettlementEdit = mode === 'edit' && !!initialFull?.id
  const correctionSourceStatus = useMemo(
    () =>
      isExistingSettlementEdit
        ? (initialFull?.status ?? settlementStatus ?? null)
        : (settlementStatus ?? initialFull?.status ?? null),
    [isExistingSettlementEdit, initialFull?.status, settlementStatus],
  )
  const correctionSourceAdminNote = isExistingSettlementEdit
    ? (initialFull?.admin_note ?? null)
    : (initialFull?.admin_note ?? null)
  const isGuideCorrectionDisplayActive =
    !isAdminReview && correctionSourceStatus === 'edit_requested'
  const showGuideCorrectionChrome =
    isGuideCorrectionDisplayActive && (!guideCorrectionShellActive || correctionHighlightReady)
  const role: SettlementFormRole = isPreview ? 'readOnly' : (isAdminReview ? 'admin' : formRole)
  const audience = summaryAudienceFromRole(role)
  const isAdmin = role === 'admin'
  const showSectionMeta = isAdmin || isAdminReview || isPreview
  const showAdminSections = shouldShowAdminSettlementSections(isAdmin, isAdminReview)
  const adminActorRole = adminEdit?.actorRole ?? 'admin'
  const adminWorkflowSource = useMemo(() => {
    const status = isExistingSettlementEdit
      ? (initialFull?.status ?? settlementStatus ?? null)
      : (settlementStatus ?? initialFull?.status ?? null)
    const guide_submit_snapshot_id = isExistingSettlementEdit
      ? (initialFull?.guide_submit_snapshot_id ?? guideSubmitSnapshotId ?? null)
      : (guideSubmitSnapshotId ?? initialFull?.guide_submit_snapshot_id ?? null)
    return {
      status,
      guide_submit_snapshot_id,
      guide_confirmed_at: initialFull?.guide_confirmed_at ?? null,
    }
  }, [
    isExistingSettlementEdit,
    initialFull?.status,
    initialFull?.guide_submit_snapshot_id,
    initialFull?.guide_confirmed_at,
    settlementStatus,
    guideSubmitSnapshotId,
  ])
  const canSendForConfirmation = isAdminReview
    && adminWorkflowSource.status !== null
    && canAdminSendForConfirmationOnSettlement(
      {
        status: adminWorkflowSource.status,
        guide_submit_snapshot_id: adminWorkflowSource.guide_submit_snapshot_id,
      },
      adminActorRole,
    )
  const canRequestGuideCorrection = isAdminReview
    && adminWorkflowSource.status !== null
    && canAdminRequestEditOnSettlement(
      {
        status: adminWorkflowSource.status,
        guide_submit_snapshot_id: adminWorkflowSource.guide_submit_snapshot_id,
        guide_confirmed_at: adminWorkflowSource.guide_confirmed_at,
      },
      adminActorRole,
    )

  const guideCorrection = useMemo(() => {
    if (!showGuideCorrectionChrome) {
      return parseCorrectionNote(null)
    }
    return parseCorrectionNote(correctionSourceAdminNote)
  }, [showGuideCorrectionChrome, correctionSourceAdminNote])

  const attentionSectionIds = useMemo(
    () => new Set(guideCorrection.sections),
    [guideCorrection.sections],
  )

  const guideRowHighlights = useMemo(() => {
    if (!showGuideCorrectionChrome || guideCorrection.targets.length === 0) {
      return new Map<string, GuideRowCorrectionHighlight>()
    }

    const rowCollections =
      isExistingSettlementEdit && initialFull
        ? correctionRowCollectionsFromFull(initialFull)
        : correctionRowCollectionsFromStore()

    return buildGuideRowHighlights(guideCorrection.targets, rowCollections)
  }, [
    showGuideCorrectionChrome,
    isExistingSettlementEdit,
    initialFull,
    guideCorrection.targets,
    hotelRowCount,
    mealRowCount,
    entranceRowCount,
    otherRowCount,
    shoppingRowCount,
    optionRowCount,
  ])

  const openSectionCorrection = useCallback((sectionId: CorrectionSectionId) => {
    setCorrectionModalError('')
    setCorrectionModalMode('contextual')
    setCorrectionTarget(emptyCorrectionTarget(sectionId, { kind: 'section' }))
    setShowCorrectionModal(true)
  }, [])

  const openRowCorrection = useCallback(
    (draft: Omit<CorrectionTarget, 'reason' | 'proposed'>) => {
      setCorrectionModalError('')
      setCorrectionModalMode('contextual')
      setCorrectionTarget(
        emptyCorrectionTarget(draft.section, {
          ...draft,
          reason: '',
          proposed: null,
        }),
      )
      setShowCorrectionModal(true)
    },
    [],
  )

  const openGlobalCorrection = useCallback(() => {
    setCorrectionModalError('')
    setCorrectionModalMode('global')
    setGlobalCorrectionSections([])
    setGlobalCorrectionReason('')
    setShowCorrectionModal(true)
  }, [])

  const correctionRequestHandlers = useMemo(
    () =>
      canRequestGuideCorrection
        ? {
            canRequest: true,
            requestSection: openSectionCorrection,
            requestRow: openRowCorrection,
          }
        : null,
    [canRequestGuideCorrection, openSectionCorrection, openRowCorrection],
  )

  const guideCorrectionHighlight = useMemo(() => {
    if (!showGuideCorrectionChrome) return null
    return {
      activeJumpClientId,
      getRowHighlight: (clientId: string) => guideRowHighlights.get(clientId),
      isFieldHighlighted: (clientId: string, field: string) => {
        const hl = guideRowHighlights.get(clientId)
        return !!hl?.field && hl.field === field
      },
    }
  }, [showGuideCorrectionChrome, activeJumpClientId, guideRowHighlights])

  const applyCorrectionJump = useCallback(
    (target: Pick<CorrectionTarget, 'section' | 'kind' | 'rowId' | 'clientId' | 'rowLabel'>) => {
      setOpenSectionId(target.section)

      let matchedClientId: string | null = target.clientId

      if (target.kind === 'row' || target.kind === 'amount_mismatch') {
        const rowsBySection =
          isExistingSettlementEdit && initialFull
            ? correctionRowCollectionsFromFull(initialFull)
            : correctionRowCollectionsFromStore()
        const rows = rowsBySection[target.section] ?? []
        const matchTarget: CorrectionTarget = {
          section: target.section,
          kind: target.kind,
          rowId: target.rowId,
          clientId: target.clientId,
          rowLabel: target.rowLabel,
          field: null,
          reason: '',
          proposed: null,
        }
        const matched = rows.find((row) => correctionTargetMatchesRow(matchTarget, row))
        matchedClientId = matched?.clientId ?? target.clientId
      }

      setActiveJumpClientId(matchedClientId)
      correctionJumpPending.current = {
        sectionId: target.section,
        clientId: matchedClientId,
      }
      setCorrectionJumpIndex((i) => i + 1)
    },
    [isExistingSettlementEdit, initialFull],
  )

  const handleJumpToCorrectionTarget = useCallback(() => {
    const jumpTargets =
      guideCorrection.targets.length > 0
        ? guideCorrection.targets
        : guideCorrection.sections.map((section) =>
            emptyCorrectionTarget(section, {
              kind: 'section',
              reason: guideCorrection.reason,
            }),
          )

    if (jumpTargets.length === 0) return

    const target = jumpTargets[correctionJumpIndex % jumpTargets.length]
    applyCorrectionJump(target)
  }, [guideCorrection, correctionJumpIndex, applyCorrectionJump])

  useEffect(() => {
    if (guideCorrectionShellActive) {
      setCorrectionHighlightReady(true)
    }
  }, [guideCorrectionShellActive])

  useEffect(() => {
    if (!guideCorrectionShellActive || !initialFull?.id) return

    const onJump = (event: Event) => {
      const detail = (event as CustomEvent<GuideCorrectionJumpDetail>).detail
      if (!detail || detail.settlementId !== initialFull.id) return
      applyCorrectionJump(detail)
    }

    window.addEventListener(GUIDE_CORRECTION_JUMP_EVENT, onJump)

    const hashSection = parseCorrectionSectionFromHash(window.location.hash)
    if (hashSection) {
      setOpenSectionId(hashSection)
    }

    return () => window.removeEventListener(GUIDE_CORRECTION_JUMP_EVENT, onJump)
  }, [guideCorrectionShellActive, initialFull?.id, applyCorrectionJump])

  useEffect(() => {
    const pending = correctionJumpPending.current
    if (!pending) return
    correctionJumpPending.current = null

    const scroll = () => {
      if (pending.clientId) {
        const el = document.getElementById(`correction-row-${pending.clientId}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          return
        }
      }
      document
        .getElementById(`correction-section-${pending.sectionId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(scroll)
    })
  }, [openSectionId, correctionJumpIndex, activeJumpClientId])

  useEffect(() => {
    if (guideCorrectionShellActive) return
    if (correctionAutoExpanded.current) return
    if (!isGuideCorrectionDisplayActive) return
    const first = guideCorrection.targets[0]?.section ?? guideCorrection.sections[0]
    if (!first) return
    correctionAutoExpanded.current = true
    setOpenSectionId(first)
  }, [isGuideCorrectionDisplayActive, guideCorrectionShellActive, guideCorrection.targets, guideCorrection.sections])

  const hydratedFromFullId = useRef<string | null>(null)
  const adminRebootstrapAttemptedRef = useRef(false)

  useEffect(() => {
    adminRebootstrapAttemptedRef.current = false
  }, [initialFull?.id])

  useEffect(() => {
    if (mode !== 'new') return
    const targetTourId = initialTourId ?? useSettlementFormStore.getState().tourId
    if (!targetTourId) return
    const state = useSettlementFormStore.getState()
    if (state.tourId === targetTourId && state.tour?.id === targetTourId) return
    const tour = tours.find((t) => t.id === targetTourId)
    if (tour) bindTourMetadata(tour)
  }, [mode, initialTourId, tours, bindTourMetadata])

  useEffect(() => {
    const bootstrap = () => {
      if (mode === 'preview') {
        if (hydratedFromFullId.current === 'preview') return
        hydratedFromFullId.current = 'preview'
        useSettlementFormStore.setState(stateFromMock(guideName))
        return
      }

      if (mode === 'edit') {
        if (!initialFull) return

        if (isAdminReview) {
          const plan = resolveEditFormBootstrap({
            isAdminReview: true,
            formRole,
            initialFull,
            guideName,
            clientState: useSettlementFormStore.getState(),
          })
          applyEditFormBootstrapPlan(
            useSettlementFormStore,
            plan,
            guideName,
            hydrateFromFull,
          )

          const reapplyAdminServerStateIfNeeded = () => {
            if (shouldAdminEditRebootstrap(initialFull, useSettlementFormStore.getState())) {
              applyAdminServerWinsState(useSettlementFormStore, initialFull, guideName)
            }
          }
          reapplyAdminServerStateIfNeeded()
          if (!adminRebootstrapAttemptedRef.current) {
            adminRebootstrapAttemptedRef.current = true
            queueMicrotask(reapplyAdminServerStateIfNeeded)
          }
          return
        }

        if (hydratedFromFullId.current === initialFull.id) return
        hydratedFromFullId.current = initialFull.id
        const plan = resolveEditFormBootstrap({
          isAdminReview: false,
          formRole,
          initialFull,
          guideName,
          clientState: useSettlementFormStore.getState(),
        })
        applyEditFormBootstrapPlan(
          useSettlementFormStore,
          plan,
          guideName,
          hydrateFromFull,
        )
        return
      }

      if (hydratedFromFullId.current === 'new') return
      hydratedFromFullId.current = 'new'

      const s = useSettlementFormStore.getState()
      const selectedTourId = initialTourId ?? null

      const bindTourIfNeeded = (tourId: string | null) => {
        if (!tourId) return
        const tour = tours.find((t) => t.id === tourId)
        if (tour) bindTourMetadata(tour)
      }

      if (shouldSkipNewFormBootstrapReset(s, selectedTourId, guideName)) {
        bindTourIfNeeded(selectedTourId ?? s.tourId)
        return
      }

      const decision = resolveNewSettlementBinding(
        {
          settlementId: s.settlementId,
          tourId: s.tourId,
          guideName: s.guideName,
          dirty: s.dirty,
          saveStatus: s.saveStatus,
          hasLineItems: hasActiveLocalDraft(s),
        },
        selectedTourId,
        guideName,
      )
      if (decision.reset) resetNew(guideName)
      bindTourIfNeeded(decision.bindTourId)
    }

    return runPersistAwareBootstrap(useSettlementFormStore.persist, bootstrap)
  }, [mode, initialFull, guideName, formRole, isAdminReview, initialTourId, tours, hydrateFromFull, resetNew, bindTourMetadata])

  const runValidation = useCallback((intent: 'draft' | 'submit') => {
    const actor = isAdminReview ? 'admin' : 'guide'
    const issues = validateSettlementForm(useSettlementFormStore.getState(), intent, actor)
    setValidationIssues(issues)
    const section = firstErrorSection(issues)
    if (section) setOpenSectionId(section)
    const errors = validationErrors(issues)
    return { ok: errors.length === 0, errors }
  }, [isAdminReview])

  const handleSave = useCallback(async (options?: {
    managePending?: boolean
    action?: SettlementFormAction
  }): Promise<{ ok: boolean; debugTimings?: SaveDebugTimings }> => {
    if (isPreview) return { ok: false }
    if (saveInFlightRef.current) return { ok: false }

    const action: SettlementFormAction = options?.action ?? 'save_only'

    if (
      isAdminReview &&
      isExistingSettlementEdit &&
      initialFull &&
      isAdminEditHydrationBroken(initialFull, useSettlementFormStore.getState())
    ) {
      const message = '정산 데이터를 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.'
      setSaveError(message)
      logSubmitFlowAction({
        action,
        validationStep: 'admin_hydration',
        settlementId: initialFull.id,
        error: message,
      })
      return { ok: false }
    }

    const { ok, errors } = runValidation('draft')
    if (!ok) {
      const message = errors[0]?.message ?? '입력 내용을 확인해주세요.'
      setSaveError(message)
      logSubmitFlowAction({
        action,
        validationStep: 'draft',
        settlementId: useSettlementFormStore.getState().settlementId,
        error: message,
      })
      return { ok: false }
    }

    const state = useSettlementFormStore.getState()
    const managePending = options?.managePending !== false
    if (managePending) setPendingAction('save')
    if (managePending) setSaving()
    saveInFlightRef.current = true

    try {
      const payload = toDraftPayload(state)

      if (isAdminReview) {
        const result = await saveAdminSettlementEdits(payload)
        if (result.ok) {
          markSaved(state.settlementId!)
          if (result.sync) mergeServerSync(result.sync)
          return { ok: true }
        }
        const message = result.error ?? '저장 실패'
        setSaveError(message)
        logSubmitFlowAction({
          action,
          saveStep: 'admin_save',
          settlementId: state.settlementId,
          error: message,
        })
        return { ok: false }
      }

      const saveResult = await saveSettlementDraft(payload, {
        purpose: action === 'save_then_submit' ? 'save_before_submit' : 'draft_save_only',
      })
      const result = applyDraftSaveResult(saveResult, {
        currentSettlementId: state.settlementId,
        bindSettlementId,
        markSaved,
        mergeServerSync,
        setSaveError,
      })

      if (result.ok && result.settlementId) {
        logSaveDebugTimings(action, saveResult._debugTimings, {
          settlementId: result.settlementId,
        })
        if (
          managePending &&
          shouldNavigateNewSettlementToEdit(
            mode,
            true,
            result.becameExistingSettlement,
            !!state.settlementId,
          )
        ) {
          // Drop session draft before edit route so server hydration cannot merge with stale rows.
          useSettlementFormStore.persist.clearStorage()
          router.replace(`/guide/settlements/${result.settlementId}/edit`)
        }
        return { ok: true, debugTimings: saveResult._debugTimings }
      }

      const message = useSettlementFormStore.getState().saveError ?? '저장 실패'
      logSaveDebugTimings(action, saveResult._debugTimings, {
        saveStep: 'save_settlement_draft',
        settlementId: result.settlementId ?? state.settlementId,
        error: message,
      })
      if (!saveResult._debugTimings) {
        logSubmitFlowAction({
          action,
          saveStep: 'save_settlement_draft',
          settlementId: result.settlementId ?? state.settlementId,
          error: message,
        })
      }
      return { ok: false, debugTimings: saveResult._debugTimings }
    } catch {
      const message = '네트워크 오류가 발생했습니다.'
      setSaveError(message)
      logSubmitFlowAction({
        action,
        saveStep: 'client_exception',
        settlementId: useSettlementFormStore.getState().settlementId,
        error: message,
      })
      return { ok: false }
    } finally {
      saveInFlightRef.current = false
      if (managePending) setPendingAction(null)
    }
  }, [
    isPreview,
    isAdminReview,
    isExistingSettlementEdit,
    initialFull,
    mode,
    router,
    runValidation,
    setSaving,
    bindSettlementId,
    markSaved,
    mergeServerSync,
    setSaveError,
  ])

  const handleSendForConfirmation = useCallback(async () => {
    if (isPreview || !isAdminReview || !adminEdit) return

    if (!adminWorkflowSource.status) {
      setSaveError('정산서 상태를 확인할 수 없습니다.')
      return
    }
    const guard = assertAdminSendForConfirmation(
      adminWorkflowSource.status,
      adminWorkflowSource.guide_submit_snapshot_id,
    )
    if (!guard.ok) {
      setSaveError(guard.error)
      return
    }

    if (!window.confirm(`${SEND_FOR_CONFIRMATION_WARNING}\n\n변경사항을 저장한 뒤 가이드에게 최종 확인을 요청하시겠습니까?`)) {
      return
    }

    const saved = await handleSave()
    if (!saved.ok) return

    const id = useSettlementFormStore.getState().settlementId
    if (!id) {
      setSaveError('정산서 ID를 찾을 수 없습니다. 페이지를 새로고침 후 다시 시도해주세요.')
      return
    }

    setPendingAction('send')
    try {
      const result = await sendForConfirmation(id)
      if (result.ok) {
        router.push(adminEdit.backHref)
        return
      }
      setSaveError(result.error ?? '가이드 최종확인 요청 실패')
    } catch {
      setSaveError('네트워크 오류가 발생했습니다.')
    } finally {
      setPendingAction(null)
    }
  }, [isPreview, isAdminReview, adminEdit, adminWorkflowSource, handleSave, router, setSaveError])

  const handleRequestGuideCorrection = useCallback(async () => {
    if (isPreview || !isAdminReview || !adminEdit || !canRequestGuideCorrection) return

    setCorrectionModalError('')

    let encoded = ''
    if (correctionModalMode === 'contextual') {
      const validation = validateCorrectionTargets([correctionTarget])
      if (!validation.ok) {
        setCorrectionModalError(validation.error)
        return
      }
      encoded = encodeCorrectionNoteFromTargets([correctionTarget])
    } else {
      const validation = validateCorrectionRequestInput(
        globalCorrectionSections,
        globalCorrectionReason,
      )
      if (!validation.ok) {
        setCorrectionModalError(validation.error)
        return
      }
      encoded = encodeCorrectionNoteFromTargets(
        sectionsToTargets(globalCorrectionSections, globalCorrectionReason),
      )
    }

    const id = useSettlementFormStore.getState().settlementId
    if (!id) {
      setCorrectionModalError('정산서 ID를 찾을 수 없습니다. 페이지를 새로고침 후 다시 시도해주세요.')
      return
    }

    setPendingAction('request_edit')
    try {
      const result = await reviewSettlement({
        id,
        action: 'request_edit',
        adminNote: encoded,
      })
      if (result.ok) {
        setCorrectionModalError('')
        setShowCorrectionModal(false)
        router.push(adminEdit.backHref)
        return
      }
      setCorrectionModalError(result.error ?? '가이드 수정 요청 실패')
    } catch {
      setCorrectionModalError('네트워크 오류가 발생했습니다.')
    } finally {
      setPendingAction(null)
    }
  }, [
    isPreview,
    isAdminReview,
    adminEdit,
    canRequestGuideCorrection,
    correctionModalMode,
    correctionTarget,
    globalCorrectionSections,
    globalCorrectionReason,
    router,
    setSaveError,
  ])

  const handleSubmit = useCallback(async () => {
    if (isPreview || isAdminReview) return
    if (saveInFlightRef.current || pendingAction !== null) return

    const submitGate = canProceedToSubmit(useSettlementFormStore.getState())
    if (!submitGate.ok) {
      setSaveError(submitGate.error)
      return
    }

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

    setPendingAction('submit')
    try {
      const result = await submitCurrentSettlement({
        getSettlementId: () => useSettlementFormStore.getState().settlementId,
        saveDraft: async () => {
          const saveResult = await handleSave({ managePending: false, action: 'save_then_submit' })
          if (saveResult.ok) {
            return { ok: true as const, debugTimings: saveResult.debugTimings }
          }
          return {
            ok: false as const,
            error: useSettlementFormStore.getState().saveError ?? undefined,
            saveStep: 'client_handle_save',
            debugTimings: saveResult.debugTimings,
          }
        },
        submitWithDraft: (id) =>
          submitSettlement(id, toDraftPayload(useSettlementFormStore.getState())),
        submitSaved: (id) => submitSettlement(id),
      })

      if (result.ok) {
        const id = useSettlementFormStore.getState().settlementId
        router.push(`/guide/settlements/${id}`)
        return
      }

      if (result.error) setSaveError(result.error)
    } catch {
      setSaveError('네트워크 오류가 발생했습니다.')
    } finally {
      setPendingAction(null)
    }
  }, [isPreview, isAdminReview, pendingAction, handleSave, router, runValidation, setSaveError])

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

  const withSectionAttention = (section: AccordionSection): AccordionSection => {
    if (!attentionSectionIds.has(section.id as CorrectionSectionId)) return section
    const sectionId = section.id as CorrectionSectionId
    const msg =
      sectionAttentionMessage(guideCorrection, sectionId) ??
      getCorrectionSectionDefaultMessage(sectionId) ??
      guideCorrection.reason
    return {
      ...section,
      needsAttention: true,
      attentionMessage: msg,
    }
  }

  const sectionsWithAttention = accordionSections.map(withSectionAttention)

  return (
    <SettlementFormProvider
      role={role}
      adminReviewEdit={isAdminReview}
      correctionRequest={correctionRequestHandlers}
      guideCorrectionHighlight={guideCorrectionHighlight}
    >
    <div className={`flex flex-col min-h-screen ${isAdminReview ? 'pb-52' : 'pb-36'}`}>
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
        {!isPreview && !guideCorrectionShellActive && guideCorrection.reason && isGuideCorrectionDisplayActive && (
          <GuideCorrectionBanner
            correction={guideCorrection}
            onJumpToTarget={handleJumpToCorrectionTarget}
          />
        )}
        {!isPreview && (
          <ValidationBanner
            issues={validationIssues}
            onDismiss={() => setValidationIssues([])}
          />
        )}
        <SettlementAccordion
          sections={sectionsWithAttention}
          openId={openSectionId}
          onOpenIdChange={setOpenSectionId}
          showSectionMeta={showSectionMeta}
          showSectionCorrectionAction={canRequestGuideCorrection}
          onSectionCorrectionRequest={openSectionCorrection}
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
          onRequestGuideCorrection={
            isAdminReview && canRequestGuideCorrection ? openGlobalCorrection : undefined
          }
          pendingAction={pendingAction}
          hideSubmit={isAdminReview}
          showSendForConfirmation={canSendForConfirmation}
          showRequestGuideCorrection={canRequestGuideCorrection}
          saveLabel="임시저장"
          submitLabel="저장 후 제출"
          sendForConfirmationLabel="저장 후 가이드 최종확인 요청"
          requestGuideCorrectionLabel="기타 수정 요청"
        />
      )}

      <CorrectionRequestModal
        open={showCorrectionModal && isAdminReview}
        onClose={() => {
          setShowCorrectionModal(false)
          setCorrectionModalError('')
        }}
        mode={correctionModalMode}
        target={correctionTarget}
        globalSections={globalCorrectionSections}
        globalReason={globalCorrectionReason}
        onTargetChange={setCorrectionTarget}
        onGlobalSectionsChange={setGlobalCorrectionSections}
        onGlobalReasonChange={setGlobalCorrectionReason}
        onSubmit={handleRequestGuideCorrection}
        pending={pendingAction === 'request_edit'}
        error={correctionModalError}
      />
    </div>
    </SettlementFormProvider>
  )
}
