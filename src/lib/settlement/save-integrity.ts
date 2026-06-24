import type { SaveStatus, SettlementFormState, DraftCompanyExpenseRow } from './form-types'
import type { SettlementFull } from '@/types'
import type { SettlementDraftPayload } from './mappers'

export const SAVE_FAILED_SUBMIT_BLOCKED =
  '저장에 실패했습니다. 임시저장을 완료한 뒤 제출해주세요.'

export const ADMIN_COMPANY_EXPENSE_HYDRATION_SAVE_ERROR =
  '관리자 입력 항목이 정상적으로 불러오지 않았습니다. 새로고침 후 다시 시도해주세요.'

export const LINE_ITEM_SECTION_HYDRATION_SAVE_ERROR =
  '정산 항목이 정상적으로 불러오지 않았습니다. 새로고침 후 다시 시도해주세요.'

export const SETTLEMENT_LINE_ITEM_LOAD_ERROR =
  '정산서 항목을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.'

type LineItemSectionKey = 'hotels' | 'meals' | 'entrances' | 'others' | 'shoppings'

const GUIDE_LINE_ITEM_SECTIONS: LineItemSectionKey[] = [
  'hotels',
  'meals',
  'entrances',
  'others',
  'shoppings',
]

/** Reject saves that would wipe a section via empty/stale hydration payload. */
export function assertGuideLineItemSectionSaveAllowed(
  existingRows: Array<{ id?: string }>,
  payloadRows: Array<{ id?: string; deleted?: boolean }> | undefined,
): { ok: true } | { ok: false; error: string } {
  const existingCount = existingRows.length
  if (existingCount === 0) return { ok: true }

  const rows = payloadRows ?? []
  if (rows.length === 0) {
    return { ok: false, error: LINE_ITEM_SECTION_HYDRATION_SAVE_ERROR }
  }

  const activeRows = rows.filter((row) => !row.deleted)
  const hasAnyPersistedId = rows.some((row) => !!row.id)
  if (activeRows.length > 0 && !hasAnyPersistedId) {
    return { ok: false, error: LINE_ITEM_SECTION_HYDRATION_SAVE_ERROR }
  }

  return { ok: true }
}

export function assertGuideLineItemSectionsSaveAllowed(
  existing: Pick<
    SettlementFull,
    'hotels' | 'meals' | 'entrances' | 'others' | 'shoppings'
  >,
  payload: Pick<
    SettlementDraftPayload,
    'hotels' | 'meals' | 'entrances' | 'others' | 'shoppings'
  >,
): { ok: true } | { ok: false; error: string } {
  for (const section of GUIDE_LINE_ITEM_SECTIONS) {
    const guard = assertGuideLineItemSectionSaveAllowed(
      existing[section] ?? [],
      payload[section],
    )
    if (!guard.ok) return guard
  }
  return { ok: true }
}

export type LineItemSectionLoadFailure = {
  table: string
  message: string
}

/** First failed section query — used to abort loads/saves instead of treating as empty. */
export function firstLineItemSectionLoadFailure(
  results: Array<{ table: string; error?: string }>,
): LineItemSectionLoadFailure | null {
  for (const result of results) {
    if (result.error) {
      return { table: result.table, message: result.error }
    }
  }
  return null
}

/** Reject admin saves that would wipe DB company expenses via an empty hydration-failure payload. */
export function assertAdminCompanyExpenseSaveAllowed(
  existing: Pick<SettlementFull, 'company_expenses'>,
  payloadCompanyExpenses: DraftCompanyExpenseRow[] | undefined,
): { ok: true } | { ok: false; error: string } {
  const existingCount = (existing.company_expenses ?? []).length
  if (existingCount === 0) return { ok: true }

  const rows = payloadCompanyExpenses ?? []
  // Broken hydration sends no row shells; intentional delete-all still sends soft-deleted rows.
  if (rows.length === 0) {
    return { ok: false, error: ADMIN_COMPANY_EXPENSE_HYDRATION_SAVE_ERROR }
  }

  return { ok: true }
}

type LineItemDraft = { deleted?: boolean }

function activeLineItemCount(rows: LineItemDraft[] | undefined): number {
  return (rows ?? []).filter((r) => !r.deleted).length
}

/** True when the store holds in-progress guide line-item work worth preserving. */
export function hasActiveLocalDraft(state: {
  dirty?: boolean
  saveStatus?: SaveStatus
  hotels?: LineItemDraft[]
  meals?: LineItemDraft[]
  entrances?: LineItemDraft[]
  others?: LineItemDraft[]
  shoppings?: LineItemDraft[]
  options?: LineItemDraft[]
}): boolean {
  if (state.dirty || state.saveStatus === 'error' || state.saveStatus === 'saving') {
    return true
  }
  return (
    activeLineItemCount(state.options) +
      activeLineItemCount(state.entrances) +
      activeLineItemCount(state.hotels) +
      activeLineItemCount(state.meals) +
      activeLineItemCount(state.others) +
      activeLineItemCount(state.shoppings) >
    0
  )
}

/** Skip destructive new-form bootstrap when a same-tour local draft must survive remount/rehydrate. */
export function shouldSkipNewFormBootstrapReset(
  state: Pick<SettlementFormState, 'guideName' | 'tourId' | 'settlementId' | 'dirty' | 'saveStatus'> & {
    hotels?: LineItemDraft[]
    meals?: LineItemDraft[]
    entrances?: LineItemDraft[]
    others?: LineItemDraft[]
    shoppings?: LineItemDraft[]
    options?: LineItemDraft[]
  },
  selectedTourId: string | null,
  guideName: string,
): boolean {
  if (state.guideName && state.guideName !== guideName) return false
  const tourOk = !selectedTourId || state.tourId === selectedTourId
  if (!tourOk) return false
  if (state.settlementId != null && (state.dirty || state.saveStatus === 'error')) return true
  return hasActiveLocalDraft(state)
}

function preferNonEmptyRows<T>(current: T[] | undefined, persisted: T[] | undefined): T[] {
  if (current && current.length > 0) return current
  return persisted ?? []
}

/** Merge persisted session draft with live store without clobbering active dirty/error work. */
export function mergePersistedSettlementDraft(
  persisted: Partial<SettlementFormState> | undefined,
  current: SettlementFormState,
): SettlementFormState {
  const p = persisted ?? {}
  const liveDraftActive =
    current.dirty || current.saveStatus === 'error' || current.saveStatus === 'saving'
  const persistedDraftActive =
    p.dirty === true || p.saveStatus === 'error' || p.saveStatus === 'saving'

  if (liveDraftActive || persistedDraftActive) {
    return {
      ...current,
      ...p,
      settlementId: current.settlementId ?? p.settlementId ?? null,
      tour: current.tour ?? p.tour ?? null,
      tourId: current.tourId ?? p.tourId ?? null,
      guideName: current.guideName || p.guideName || '',
      hotels: preferNonEmptyRows(current.hotels, p.hotels),
      meals: preferNonEmptyRows(current.meals, p.meals),
      entrances: preferNonEmptyRows(current.entrances, p.entrances),
      others: preferNonEmptyRows(current.others, p.others),
      companyExpenses: preferNonEmptyRows(current.companyExpenses, p.companyExpenses),
      shoppings: preferNonEmptyRows(current.shoppings, p.shoppings),
      options: preferNonEmptyRows(current.options, p.options),
      dirty: Boolean(current.dirty || p.dirty),
      saveStatus:
        liveDraftActive &&
        (current.saveStatus === 'error' || current.saveStatus === 'saving')
          ? current.saveStatus
          : (p.saveStatus ?? current.saveStatus ?? 'idle'),
      saveError: current.saveError ?? p.saveError ?? null,
      lastSavedAt: current.lastSavedAt ?? p.lastSavedAt ?? null,
    }
  }

  return {
    ...current,
    ...p,
    receipts: p.receipts ?? current.receipts ?? [],
    settlementStatus: p.settlementStatus ?? current.settlementStatus ?? null,
    guideSubmitSnapshotId: p.guideSubmitSnapshotId ?? current.guideSubmitSnapshotId ?? null,
    hotels: p.hotels ?? current.hotels ?? [],
    meals: p.meals ?? current.meals ?? [],
    entrances: p.entrances ?? current.entrances ?? [],
    others: p.others ?? current.others ?? [],
    companyExpenses: p.companyExpenses ?? current.companyExpenses ?? [],
    shoppings: p.shoppings ?? current.shoppings ?? [],
    options: p.options ?? current.options ?? [],
    dirty: p.dirty ?? current.dirty ?? false,
    saveStatus: p.saveStatus ?? current.saveStatus ?? 'idle',
    saveError: p.saveError ?? current.saveError ?? null,
    lastSavedAt: p.lastSavedAt ?? current.lastSavedAt ?? null,
  }
}

/** Keep client line items when a failed save left dirty/error state for the same settlement. */
export function shouldPreserveClientDraftOnHydration(
  state: {
    settlementId: string | null
    dirty: boolean
    saveStatus: SaveStatus
  },
  serverSettlementId: string,
): boolean {
  return (
    state.settlementId === serverSettlementId &&
    (state.dirty === true || state.saveStatus === 'error')
  )
}

export function footerStatusLabel(input: {
  pendingAction: 'save' | 'send' | 'submit' | 'request_edit' | null
  saveStatus: SaveStatus
  dirty: boolean
  saveError: string | null
  lastSavedAt: string | null
  formatSavedAt?: (iso: string) => string
}): string {
  const {
    pendingAction,
    saveStatus,
    dirty,
    saveError,
    lastSavedAt,
    formatSavedAt = (iso) => iso,
  } = input

  if (pendingAction === 'save' || (saveStatus === 'saving' && pendingAction !== 'submit')) {
    return '저장 중…'
  }
  if (pendingAction === 'send') return '처리 중…'
  if (pendingAction === 'request_edit') return '수정요청 처리 중…'
  if (pendingAction === 'submit') return '저장 후 제출 중…'
  if (saveStatus === 'saved' && !dirty) {
    return lastSavedAt
      ? `저장됨 ${formatSavedAt(lastSavedAt)}`
      : '저장됨'
  }
  if (saveStatus === 'error') return saveError ?? '저장 실패'
  if (dirty) return '변경됨'
  return '미저장'
}

export function canProceedToSubmit(state: {
  saveStatus: SaveStatus
}): { ok: true } | { ok: false; error: string } {
  if (state.saveStatus === 'error') {
    return { ok: false, error: SAVE_FAILED_SUBMIT_BLOCKED }
  }
  return { ok: true }
}

/** Gate destructive post-save navigation — only on full success. */
export function shouldNavigateNewSettlementToEdit(
  mode: 'new' | 'edit' | 'preview',
  saveOk: boolean,
  becameExistingSettlement: boolean,
  hadBoundSettlementIdBeforeSave = false,
): boolean {
  if (mode !== 'new' || !saveOk) return false
  return becameExistingSettlement || hadBoundSettlementIdBeforeSave
}
