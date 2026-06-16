import type { SettlementFull } from '@/types'

import {
  countPersistGuideLineItemTableRequests,
  filterRowsNeedingUpdate,
  GUIDE_LINE_ITEM_TABLES,
} from './guide-line-item-persist'
import {
  buildGuideOptionDeleteIds,
  buildLineItemDeleteIds,
  existingLineItemRowsById,
} from './line-item-persist-prep'
import {
  buildEntranceDbRows,
  buildHotelDbRows,
  buildMealDbRows,
  buildOptionDbRows,
  buildOtherDbRows,
  buildShoppingDbRows,
  splitDbRowsForPersist,
  type SettlementDraftPayload,
} from './mappers'
import type { SettlementSaveTiming } from './save-step-diagnostics'

/** Aggregated line-item persist outcome (predicted or measured). */
export type LineItemPersistAggregate = {
  totalRequests: number
  plannedDeletes: number
  plannedInserts: number
  candidateUpdates: number
  updatesSkipped: number
}

export const GUIDE_EDITABLE_SETTLEMENT_STATUSES = [
  'draft',
  'rejected',
  'edit_requested',
] as const

export const GUIDE_HEADER_UPSERT_COMPARE_KEYS = [
  'exchange_rate',
  'advance_vnd',
  'tour_fee_usd',
  'ground_fee_usd',
  'charming_other_usd',
  'tip_received_usd',
  'option_receivable_usd',
  'tip_transfer_usd',
  'option_credit_usd',
  'vehicle_fee_usd',
  'head_tax_usd',
  'seoul_biz_fee_usd',
  'tc_guide_usd',
  'tc_company_usd',
  'megugi_usd',
  'guide_daily_fee_usd',
  'settlement_ratio',
  'guide_note',
] as const

export function normalizeHeaderCompareValue(key: string, value: unknown): unknown {
  if (key === 'guide_note') {
    if (value === undefined || value === null || value === '') return null
    return value
  }
  if (value === undefined || value === null || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : value
}

/** True when the guide header upsert row would change settlement source fields. */
export function guideHeaderUpsertDiffersFromExisting(
  upsert: Record<string, unknown>,
  existing: Record<string, unknown>,
): boolean {
  for (const key of GUIDE_HEADER_UPSERT_COMPARE_KEYS) {
    const left = normalizeHeaderCompareValue(key, upsert[key])
    const right = normalizeHeaderCompareValue(key, existing[key])
    if (left !== right) return true
  }
  return false
}

export function isGuideEditableSettlementStatus(status: unknown): boolean {
  return (
    typeof status === 'string' &&
    (GUIDE_EDITABLE_SETTLEMENT_STATUSES as readonly string[]).includes(status)
  )
}

/** Predict DB requests from draft payload without writing. */
export function predictLineItemPersistAggregate(
  settlementId: string,
  payload: Pick<
    SettlementDraftPayload,
    'hotels' | 'meals' | 'entrances' | 'others' | 'shoppings' | 'options' | 'exchange_rate'
  >,
  existing: SettlementFull | null,
): LineItemPersistAggregate {
  const rate = payload.exchange_rate
  const tables: {
    table: (typeof GUIDE_LINE_ITEM_TABLES)[number]
    rows: Record<string, unknown>[]
    deleteIds: string[]
    existingById?: Map<string, Record<string, unknown>>
  }[] = [
    {
      table: 'hotel_items',
      rows: buildHotelDbRows(payload.hotels, settlementId),
      deleteIds: buildLineItemDeleteIds(
        payload.hotels,
        existing?.hotels.map((r) => r.id) ?? [],
      ),
      existingById: existingLineItemRowsById(existing?.hotels),
    },
    {
      table: 'meal_items',
      rows: buildMealDbRows(payload.meals, settlementId),
      deleteIds: buildLineItemDeleteIds(
        payload.meals,
        existing?.meals.map((r) => r.id) ?? [],
      ),
      existingById: existingLineItemRowsById(existing?.meals),
    },
    {
      table: 'entrance_items',
      rows: buildEntranceDbRows(payload.entrances, settlementId),
      deleteIds: buildLineItemDeleteIds(
        payload.entrances,
        existing?.entrances.map((r) => r.id) ?? [],
      ),
      existingById: existingLineItemRowsById(existing?.entrances),
    },
    {
      table: 'other_expense_items',
      rows: buildOtherDbRows(payload.others, settlementId),
      deleteIds: buildLineItemDeleteIds(
        payload.others,
        existing?.others.map((r) => r.id) ?? [],
      ),
      existingById: existingLineItemRowsById(existing?.others),
    },
    {
      table: 'shopping_items',
      rows: buildShoppingDbRows(payload.shoppings, settlementId),
      deleteIds: buildLineItemDeleteIds(
        payload.shoppings,
        existing?.shoppings.map((r) => r.id) ?? [],
      ),
      existingById: existingLineItemRowsById(existing?.shoppings),
    },
    {
      table: 'option_items',
      rows: buildOptionDbRows(payload.options, settlementId, rate),
      deleteIds: buildGuideOptionDeleteIds(payload.options, existing?.options ?? []),
      existingById: existingLineItemRowsById(existing?.options),
    },
  ]

  let totalRequests = 0
  let plannedDeletes = 0
  let plannedInserts = 0
  let candidateUpdates = 0
  let updatesSkipped = 0

  for (const { table, rows, deleteIds, existingById } of tables) {
    const { toInsert, toUpdate } = splitDbRowsForPersist(rows)
    const { rows: rowsToUpdate, skipped } = filterRowsNeedingUpdate(
      toUpdate,
      existingById,
      table,
    )
    plannedDeletes += deleteIds.length
    plannedInserts += toInsert.length
    candidateUpdates += toUpdate.length
    updatesSkipped += skipped
    totalRequests += countPersistGuideLineItemTableRequests(
      deleteIds.length,
      toInsert.length,
      rowsToUpdate.length,
    )
  }

  return {
    totalRequests,
    plannedDeletes,
    plannedInserts,
    candidateUpdates,
    updatesSkipped,
  }
}

export function aggregateLineItemPersistTimings(
  timings: SettlementSaveTiming[] | undefined,
): LineItemPersistAggregate {
  const tableTimings = (timings ?? []).filter(
    (t) => t.step === 'persist_line_items_table',
  )
  return {
    totalRequests: tableTimings.reduce((sum, t) => sum + (t.requestCount ?? 0), 0),
    plannedDeletes: tableTimings.reduce((sum, t) => sum + (t.deleteIds ?? 0), 0),
    plannedInserts: tableTimings.reduce((sum, t) => sum + (t.inserts ?? 0), 0),
    candidateUpdates: tableTimings.reduce((sum, t) => sum + (t.updates ?? 0), 0),
    updatesSkipped: tableTimings.reduce((sum, t) => sum + (t.updatesSkipped ?? 0), 0),
  }
}

/** Explicit save context — post-save reload skip is draft_save_only only. */
export type GuideDraftSaveContext = 'draft_save_only' | 'save_before_submit'

export type PostSaveReloadSkipInput = {
  /** 임시저장-only; save-before-submit must keep full reload path. */
  saveContext: GuideDraftSaveContext
  /** Existing settlement edit path (payload had settlementId). */
  isEditPath: boolean
  isEditableStatus: boolean
  hasPreloadedState: boolean
  headerChanged: boolean
  /** Guide draft payload does not mutate receipts; set true only when uncertain. */
  receiptsChanged: boolean
  persist: LineItemPersistAggregate
}

/**
 * Skip post-save getSettlementFull only for true no-op 임시저장 edit saves.
 * Save-before-submit, admin, and workflow actions always reload.
 */
export function canSkipPostSaveReloadForNoopSave(input: PostSaveReloadSkipInput): boolean {
  if (input.saveContext !== 'draft_save_only') return false
  if (!input.isEditPath) return false
  if (!input.isEditableStatus) return false
  if (!input.hasPreloadedState) return false
  if (input.receiptsChanged) return false
  if (input.headerChanged) return false
  if (input.persist.totalRequests !== 0) return false
  if (input.persist.plannedDeletes > 0) return false
  if (input.persist.plannedInserts > 0) return false
  return true
}
