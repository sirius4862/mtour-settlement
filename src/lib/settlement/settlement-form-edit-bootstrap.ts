import type { SettlementFull } from '@/types'
import type { SaveStatus, SettlementFormState } from './form-types'
import { stateFromSettlementFull } from './mappers'
import { shouldPreserveClientDraftOnHydration } from './save-integrity'
import { sanitizeSettlementFullForGuide } from './snapshot'

export type SettlementFormRole = 'guide' | 'admin' | 'readOnly'

export type EditFormBootstrapInput = {
  isAdminReview: boolean
  formRole: SettlementFormRole
  initialFull: SettlementFull
  guideName: string
  clientState: Pick<
    SettlementFormState,
    'settlementId' | 'dirty' | 'saveStatus' | 'saveError'
  >
}

export type EditFormBootstrapPlan =
  | {
      kind: 'admin_server_wins'
      full: SettlementFull
      clearStorage: true
      resetDraftFlags: true
    }
  | {
      kind: 'guide_preserve_draft'
      full: SettlementFull
      clearStorage: false
      resetDraftFlags: false
    }
  | {
      kind: 'guide_server_wins'
      full: SettlementFull
      clearStorage: true
      resetDraftFlags: false
    }

export type EditBootstrapStore = {
  getState: () => SettlementFormState
  setState: (
    partial:
      | Partial<SettlementFormState>
      | ((state: SettlementFormState) => Partial<SettlementFormState>),
  ) => void
  persist: { clearStorage: () => void }
}

export type PersistHydrationApi = {
  hasHydrated: () => boolean
  onFinishHydration: (fn: () => void) => () => void
}

/** Resolve edit-mode bootstrap: admin review always hydrates from server initialFull. */
export function resolveEditFormBootstrap(input: EditFormBootstrapInput): EditFormBootstrapPlan {
  const { isAdminReview, formRole, initialFull, clientState } = input

  if (isAdminReview) {
    return {
      kind: 'admin_server_wins',
      full: initialFull,
      clearStorage: true,
      resetDraftFlags: true,
    }
  }

  const fullForRole =
    formRole === 'guide' ? sanitizeSettlementFullForGuide(initialFull) : initialFull

  if (shouldPreserveClientDraftOnHydration(clientState, initialFull.id)) {
    return {
      kind: 'guide_preserve_draft',
      full: fullForRole,
      clearStorage: false,
      resetDraftFlags: false,
    }
  }

  return {
    kind: 'guide_server_wins',
    full: fullForRole,
    clearStorage: true,
    resetDraftFlags: false,
  }
}

/** Replace store state from server initialFull — bypasses hydrateFromFull preserve guards. */
export function applyAdminServerWinsState(
  store: EditBootstrapStore,
  full: SettlementFull,
  guideName: string,
): void {
  const nextState = stateFromSettlementFull(full, guideName)
  store.setState({
    ...nextState,
    dirty: false,
    saveStatus: 'idle',
    saveError: null,
    settlementStatus: full.status,
    guideSubmitSnapshotId: full.guide_submit_snapshot_id ?? null,
    receipts: full.receipts ?? [],
  })
}

/** Apply an edit bootstrap plan to the settlement form store. */
export function applyEditFormBootstrapPlan(
  store: EditBootstrapStore,
  plan: EditFormBootstrapPlan,
  guideName: string,
  hydrateFromFull: (full: SettlementFull, guideName: string) => void,
): void {
  if (plan.clearStorage) {
    store.persist.clearStorage()
  }

  if (plan.kind === 'admin_server_wins') {
    applyAdminServerWinsState(store, plan.full, guideName)
    return
  }

  if (plan.resetDraftFlags) {
    store.setState({ dirty: false, saveStatus: 'idle', saveError: null })
  }
  hydrateFromFull(plan.full, guideName)
}

/** Run bootstrap immediately when persist already hydrated, and again after hydration finishes. */
export function runPersistAwareBootstrap(
  persist: PersistHydrationApi,
  bootstrap: () => void,
): () => void {
  const unsubscribe = persist.onFinishHydration(bootstrap)
  if (persist.hasHydrated()) {
    bootstrap()
  }
  return unsubscribe
}

/** Count active (non-deleted) rows per line-item section after hydration. */
export function hydratedLineItemCounts(
  state: Pick<
    SettlementFormState,
    'hotels' | 'meals' | 'entrances' | 'others' | 'shoppings' | 'options'
  >,
): Record<'hotels' | 'meals' | 'entrances' | 'others' | 'shoppings' | 'options', number> {
  const count = <T extends { deleted?: boolean }>(rows: T[] | undefined) =>
    (rows ?? []).filter((r) => !r.deleted).length

  return {
    hotels: count(state.hotels),
    meals: count(state.meals),
    entrances: count(state.entrances),
    others: count(state.others),
    shoppings: count(state.shoppings),
    options: count(state.options),
  }
}

export function storeLineItemCountSum(
  state: Pick<
    SettlementFormState,
    'settlementId' | 'hotels' | 'meals' | 'entrances' | 'others' | 'shoppings' | 'options'
  >,
): number {
  const counts = hydratedLineItemCounts(state)
  return (
    counts.hotels +
    counts.meals +
    counts.entrances +
    counts.others +
    counts.shoppings +
    counts.options
  )
}

/** Server row counts for parity checks between initialFull and hydrated store. */
export function serverLineItemCounts(full: SettlementFull) {
  return {
    hotels: full.hotels.length,
    meals: full.meals.length,
    entrances: full.entrances.length,
    others: full.others.length,
    shoppings: full.shoppings.length,
    options: full.options.length,
    companyExpenses: (full.company_expenses ?? []).length,
  }
}

export function serverLineItemCountSum(full: SettlementFull): number {
  const counts = serverLineItemCounts(full)
  return (
    counts.hotels +
    counts.meals +
    counts.entrances +
    counts.others +
    counts.shoppings +
    counts.options
  )
}

/** True when admin edit loaded server rows but the store still has zero line items. */
export function shouldAdminEditRebootstrap(
  full: SettlementFull,
  state: Pick<
    SettlementFormState,
    'settlementId' | 'hotels' | 'meals' | 'entrances' | 'others' | 'shoppings' | 'options'
  >,
): boolean {
  if (state.settlementId !== full.id) return false
  if (serverLineItemCountSum(full) === 0) return false
  return storeLineItemCountSum(state) === 0
}

/** Expected store state after a full admin edit hydration from server data. */
export function expectedAdminHydratedState(
  full: SettlementFull,
  guideName: string,
): Pick<
  SettlementFormState,
  | 'settlementId'
  | 'dirty'
  | 'saveStatus'
  | 'saveError'
  | 'hotels'
  | 'meals'
  | 'entrances'
  | 'others'
  | 'shoppings'
  | 'options'
  | 'companyExpenses'
> {
  const fromFull = stateFromSettlementFull(full, guideName)
  return {
    settlementId: fromFull.settlementId,
    dirty: false,
    saveStatus: 'idle',
    saveError: null,
    hotels: fromFull.hotels,
    meals: fromFull.meals,
    entrances: fromFull.entrances,
    others: fromFull.others,
    shoppings: fromFull.shoppings,
    options: fromFull.options,
    companyExpenses: fromFull.companyExpenses,
  }
}

export function isCleanDraftState(input: {
  dirty: boolean
  saveStatus: SaveStatus
  saveError: string | null
}): boolean {
  return input.dirty === false && input.saveStatus === 'idle' && input.saveError === null
}

export function isAdminEditHydrationBroken(
  full: SettlementFull,
  state: Pick<
    SettlementFormState,
    'settlementId' | 'hotels' | 'meals' | 'entrances' | 'others' | 'shoppings' | 'options'
  >,
): boolean {
  return shouldAdminEditRebootstrap(full, state)
}
