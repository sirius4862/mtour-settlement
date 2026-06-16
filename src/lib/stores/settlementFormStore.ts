'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Tour, SettlementFull, Receipt } from '@/types'
import type { DraftCompanyExpenseRow, LineSection, SettlementFormState } from '@/lib/settlement/form-types'
import {
  emptyCompanyExpenseRow,
  emptyEntranceRow,
  emptyHotelRow,
  emptyMealRow,
  emptyOptionRow,
  emptyOtherRow,
  emptyShoppingRow,
} from '@/lib/settlement/defaults'
import {
  emptyFormState,
  mergeServerSync,
  stateFromSettlementFull,
  type SettlementSyncPayload,
} from '@/lib/settlement/mappers'
import { shouldPreserveClientDraftOnHydration, mergePersistedSettlementDraft } from '@/lib/settlement/save-integrity'

type RowArrays = Pick<
  SettlementFormState,
  'hotels' | 'meals' | 'entrances' | 'others' | 'shoppings' | 'options'
>

const ROW_KEYS: Record<LineSection, keyof RowArrays> = {
  hotels: 'hotels',
  meals: 'meals',
  entrances: 'entrances',
  others: 'others',
  shoppings: 'shoppings',
  options: 'options',
}

function createEmptyRow(section: LineSection) {
  switch (section) {
    case 'hotels': return emptyHotelRow()
    case 'meals': return emptyMealRow()
    case 'entrances': return emptyEntranceRow()
    case 'others': return emptyOtherRow()
    case 'shoppings': return emptyShoppingRow()
    case 'options': return emptyOptionRow(false)
  }
}

interface SettlementFormActions {
  hydrateFromFull: (full: SettlementFull, guideName: string) => void
  resetNew: (guideName: string, exchangeRate?: number) => void
  setTour: (tour: Tour) => void
  /** Attach tour metadata without clearing save/dirty state (bootstrap only). */
  bindTourMetadata: (tour: Tour) => void
  setExchangeRate: (rate: number) => void
  patchHeader: (patch: Partial<SettlementFormState['header']>) => void
  addRow: (section: LineSection) => void
  duplicateRow: (section: LineSection, clientId: string) => void
  softDeleteRow: (section: LineSection, clientId: string) => void
  updateRow: <S extends LineSection>(
    section: S,
    clientId: string,
    patch: Partial<RowArrays[typeof ROW_KEYS[S]][number]>,
  ) => void
  addCompanyExpenseRow: () => void
  duplicateCompanyExpenseRow: (clientId: string) => void
  softDeleteCompanyExpenseRow: (clientId: string) => void
  updateCompanyExpenseRow: (clientId: string, patch: Partial<DraftCompanyExpenseRow>) => void
  bindSettlementId: (id: string) => void
  markSaved: (id: string) => void
  setSaving: () => void
  setSaveError: (msg: string) => void
  mergeServerSync: (sync: SettlementSyncPayload) => void
  addReceipt: (receipt: Receipt) => void
  removeReceipt: (receiptId: string) => void
  setReceipts: (receipts: Receipt[]) => void
}

export type SettlementFormStore = SettlementFormState & SettlementFormActions

const persistable = (s: SettlementFormStore) => ({
  settlementId: s.settlementId,
  tourId: s.tourId,
  tour: s.tour,
  guideName: s.guideName,
  exchange_rate: s.exchange_rate,
  header: s.header,
  hotels: s.hotels,
  meals: s.meals,
  entrances: s.entrances,
  others: s.others,
  companyExpenses: s.companyExpenses,
  shoppings: s.shoppings,
  options: s.options,
  dirty: s.dirty,
  saveStatus: s.saveStatus,
  saveError: s.saveError,
  lastSavedAt: s.lastSavedAt,
})

export const useSettlementFormStore = create<SettlementFormStore>()(
  persist(
    (set, get) => ({
      ...emptyFormState(''),

      hydrateFromFull: (full, guideName) => {
        const current = get()
        if (shouldPreserveClientDraftOnHydration(current, full.id)) {
          set({
            settlementStatus: full.status,
            guideSubmitSnapshotId: full.guide_submit_snapshot_id ?? null,
            receipts: full.receipts ?? [],
          })
          return
        }
        set({ ...stateFromSettlementFull(full, guideName), saveStatus: 'idle', saveError: null })
      },

      resetNew: (guideName, exchangeRate) =>
        set({ ...emptyFormState(guideName, exchangeRate), saveStatus: 'idle', saveError: null }),

      setTour: (tour) =>
        set({ tourId: tour.id, tour, dirty: true, saveStatus: 'idle' }),

      bindTourMetadata: (tour) =>
        set((s) => {
          if (s.tourId === tour.id && s.tour?.id === tour.id) return s
          return { tourId: tour.id, tour }
        }),

      setExchangeRate: (exchange_rate) =>
        set({ exchange_rate, dirty: true }),

      patchHeader: (patch) =>
        set((s) => ({ header: { ...s.header, ...patch }, dirty: true })),

      addRow: (section) => {
        const key = ROW_KEYS[section]
        const row = createEmptyRow(section)
        set((s) => ({ [key]: [...s[key], row], dirty: true } as Partial<SettlementFormState>))
      },

      duplicateRow: (section, clientId) => {
        const key = ROW_KEYS[section]
        set((s) => {
          const rows = s[key] as Array<{ clientId: string; id?: string; deleted?: boolean }>
          const src = rows.find((r) => r.clientId === clientId)
          if (!src) return s
          const copy = {
            ...src,
            clientId: `dup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            id: undefined,
            deleted: false,
          }
          return { [key]: [...rows, copy], dirty: true } as Partial<SettlementFormState>
        })
      },

      softDeleteRow: (section, clientId) => {
        const key = ROW_KEYS[section]
        set((s) => ({
          [key]: (s[key] as Array<{ clientId: string; deleted?: boolean }>).map((r) =>
            r.clientId === clientId ? { ...r, deleted: true } : r,
          ),
          dirty: true,
        } as Partial<SettlementFormState>))
      },

      updateRow: (section, clientId, patch) => {
        const key = ROW_KEYS[section]
        set((s) => ({
          [key]: (s[key] as Array<{ clientId: string }>).map((r) =>
            r.clientId === clientId ? { ...r, ...patch } : r,
          ),
          dirty: true,
        } as Partial<SettlementFormState>))
      },

      addCompanyExpenseRow: () =>
        set((s) => ({
          companyExpenses: [...(s.companyExpenses ?? []), emptyCompanyExpenseRow()],
          dirty: true,
        })),

      duplicateCompanyExpenseRow: (clientId) =>
        set((s) => {
          const rows = s.companyExpenses ?? []
          const src = rows.find((r) => r.clientId === clientId)
          if (!src) return s
          const copy: DraftCompanyExpenseRow = {
            ...src,
            clientId: `dup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            id: undefined,
            deleted: false,
          }
          return { companyExpenses: [...rows, copy], dirty: true }
        }),

      softDeleteCompanyExpenseRow: (clientId) =>
        set((s) => ({
          companyExpenses: (s.companyExpenses ?? []).map((r) =>
            r.clientId === clientId ? { ...r, deleted: true } : r,
          ),
          dirty: true,
        })),

      updateCompanyExpenseRow: (clientId, patch) =>
        set((s) => ({
          companyExpenses: (s.companyExpenses ?? []).map((r) =>
            r.clientId === clientId ? { ...r, ...patch } : r,
          ),
          dirty: true,
        })),

      bindSettlementId: (id) => set({ settlementId: id, dirty: true }),

      markSaved: (id) =>
        set({
          settlementId: id,
          dirty: false,
          saveStatus: 'saved',
          lastSavedAt: new Date().toISOString(),
          saveError: null,
        }),

      setSaving: () => set({ saveStatus: 'saving', saveError: null }),

      setSaveError: (msg) =>
        set({ saveStatus: 'error', saveError: msg, dirty: true }),

      mergeServerSync: (sync) =>
        set((s) => ({ ...mergeServerSync(s, sync) })),

      addReceipt: (receipt) =>
        set((s) => ({ receipts: [receipt, ...(s.receipts ?? [])] })),

      removeReceipt: (receiptId) =>
        set((s) => ({ receipts: (s.receipts ?? []).filter((r) => r.id !== receiptId) })),

      setReceipts: (receipts) => set({ receipts: receipts ?? [] }),
    }),
    {
      name: 'settlement-form-draft',
      storage: createJSONStorage(() => sessionStorage),
      partialize: persistable,
      merge: (persisted, current) => ({
        ...current,
        ...mergePersistedSettlementDraft(persisted as Partial<SettlementFormState>, current),
      }),
    },
  ),
)

export function activeRowCount(section: LineSection, state: SettlementFormState): number {
  const key = ROW_KEYS[section]
  const rows = (state[key] as Array<{ deleted?: boolean }> | undefined) ?? []
  return rows.filter((r) => !r.deleted).length
}

export function activeCompanyExpenseCount(state: SettlementFormState): number {
  return (state.companyExpenses ?? []).filter((r) => !r.deleted).length
}

export function isReceiptEditable(state: Pick<SettlementFormState, 'settlementStatus'>): boolean {
  if (!state.settlementStatus) return true
  return ['draft', 'rejected', 'edit_requested'].includes(state.settlementStatus)
}
