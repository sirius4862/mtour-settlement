import type { SaveStatus } from './form-types'
import type { Tour } from '@/types'

export interface NewBindingPersistedState {
  settlementId: string | null
  tourId: string | null
  guideName: string
  dirty?: boolean
  saveStatus?: SaveStatus
  /** Active non-deleted line-item rows across guide sections. */
  hasLineItems?: boolean
}

export interface NewBindingDecision {
  /** Reset the form store to an empty new draft before binding. */
  reset: boolean
  /** Tour id to bind the fresh form to (null = leave unbound for manual pick). */
  bindTourId: string | null
}

/**
 * Decide how to initialize the store for a brand-new settlement form.
 *
 * Guards the guide "정산서 작성" create flow against reusing a stale persisted
 * draft from a prior edit session (e.g. an existing 수정 필요 settlement). The
 * new form must bind only to the explicitly selected assigned tour and must
 * never inherit an existing settlement id or an unrelated tour.
 *
 * - If an assigned tour is selected: bind to it. Preserve the persisted draft
 *   only when it is a clean, unsaved new draft for the exact same tour + guide.
 * - If no tour is selected: only reset to clear a leaked existing settlement
 *   (settlementId set) or a different guide; otherwise keep in-progress work.
 */
export function resolveNewSettlementBinding(
  persisted: NewBindingPersistedState,
  selectedTourId: string | null,
  guideName: string,
): NewBindingDecision {
  const guideChanged = persisted.guideName !== guideName
  const hasExistingSettlement = persisted.settlementId != null

  if (selectedTourId) {
    const sameTour = persisted.tourId === selectedTourId
    const preserveInProgressDraft =
      sameTour &&
      !guideChanged &&
      (persisted.dirty === true ||
        persisted.saveStatus === 'error' ||
        persisted.saveStatus === 'saving' ||
        persisted.hasLineItems === true)

    // Resume an orphan draft created by a prior partial save for this exact tour.
    if (hasExistingSettlement && sameTour && !guideChanged) {
      return { reset: false, bindTourId: selectedTourId }
    }

    if (preserveInProgressDraft) {
      return { reset: false, bindTourId: selectedTourId }
    }

    const sameCleanDraft =
      !hasExistingSettlement &&
      !guideChanged &&
      sameTour
    if (sameCleanDraft) {
      return { reset: false, bindTourId: selectedTourId }
    }
    return { reset: true, bindTourId: selectedTourId }
  }

  if (hasExistingSettlement || guideChanged) {
    return { reset: true, bindTourId: null }
  }
  return { reset: false, bindTourId: null }
}

/**
 * Resolve a requested tour id against the guide's available (assigned) tours.
 * Returns the id only when it belongs to the guide-scoped list, so a stale or
 * unauthorized query param can never bind the form to an out-of-scope tour.
 */
export function resolveRequestedTourId(
  tours: Pick<Tour, 'id'>[],
  requested: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(requested) ? requested[0] : requested
  if (!raw) return null
  return tours.some((t) => t.id === raw) ? raw : null
}
