import type { SupabaseClient } from '@supabase/supabase-js'

import { splitDbRowsForPersist } from './mappers'

/** Base tables guides mutate during save draft (not views). */
export const GUIDE_LINE_ITEM_TABLES = [
  'hotel_items',
  'meal_items',
  'entrance_items',
  'other_expense_items',
  'shopping_items',
  'option_items',
] as const

export type GuideLineItemTable = (typeof GUIDE_LINE_ITEM_TABLES)[number]

export type LineItemPersistStep = 'orphan_delete' | 'explicit_delete' | 'insert' | 'update'

export type LineItemPersistResult =
  | { ok: true; requestCount: number; updatesSkipped?: number }
  | { ok: false; error: string; table: string; step: LineItemPersistStep; requestCount: number }

const OPTION_SOURCE_COMPARE_KEYS = [
  'option_date',
  'option_name',
  'unit_price_usd',
  'pax',
  'expense_usd',
  'expense_vnd',
  'is_extra_vehicle',
  'sort_order',
] as const

/** Normalize nullable dates and numeric fields for unchanged-row detection. */
export function normalizeComparableLineItemValue(key: string, value: unknown): unknown {
  if (key === 'is_extra_vehicle') return value === true
  if (value === undefined || value === '') return null
  if (
    key === 'unit_price_usd' ||
    key === 'pax' ||
    key === 'expense_usd' ||
    key === 'expense_vnd' ||
    key === 'total_sale_usd' ||
    key === 'com_usd' ||
    key === 'sort_order'
  ) {
    const n = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(n) ? n : value
  }
  return value
}

/** Option rows persist derived total_sale_usd/com_usd — compare source fields only. */
export function optionPatchDiffersFromExisting(
  patch: Record<string, unknown>,
  existing: Record<string, unknown> | undefined,
): boolean {
  if (!existing) return true
  for (const key of OPTION_SOURCE_COMPARE_KEYS) {
    const left = normalizeComparableLineItemValue(key, patch[key])
    const right = normalizeComparableLineItemValue(key, existing[key])
    if (left !== right) return true
  }
  return false
}

/** Skip per-row UPDATE when patch matches the pre-loaded settlement row. */
export function rowPatchDiffersFromExisting(
  patch: Record<string, unknown>,
  existing: Record<string, unknown> | undefined,
  table?: GuideLineItemTable | string,
): boolean {
  if (!existing) return true
  if (table === 'option_items') {
    return optionPatchDiffersFromExisting(patch, existing)
  }
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'id' || key === 'settlement_id') continue
    const left = normalizeComparableLineItemValue(key, value)
    const right = normalizeComparableLineItemValue(key, existing[key])
    if (left !== right) return true
  }
  return false
}

export function filterRowsNeedingUpdate(
  toUpdate: Record<string, unknown>[],
  existingById?: Map<string, Record<string, unknown>>,
  table?: GuideLineItemTable | string,
): { rows: Record<string, unknown>[]; skipped: number } {
  if (!existingById || existingById.size === 0) {
    return { rows: toUpdate, skipped: 0 }
  }
  const rows = toUpdate.filter((row) => {
    const id = row.id
    if (!id || typeof id !== 'string') return true
    return rowPatchDiffersFromExisting(row, existingById.get(id), table)
  })
  return { rows, skipped: toUpdate.length - rows.length }
}

/** PostgREST `.in()` list size guard for known-id deletes. */
export const KNOWN_ID_DELETE_BATCH_SIZE = 100

/**
 * Replace line items for one table without upsert/RETURNING.
 * Hardening removed guide SELECT on base line-item tables; upsert and
 * INSERT…RETURNING require SELECT and fail RLS on hotel/meal/etc.
 *
 * Orphan removal batches known ids via `.in('id', ids)` + settlement_id —
 * RLS-safe (no settlement-wide NOT IN scan, no count=exact).
 */
/** Soft-deleted draft rows with DB ids — guides cannot SELECT base line-item tables (RLS). */
export function explicitDeleteIdsFromDraft(
  rows: Array<{ deleted?: boolean; id?: string }>,
): string[] {
  return rows.filter((r) => r.deleted && r.id).map((r) => r.id as string)
}

export function countPersistGuideLineItemTableRequests(
  deleteIdCount: number,
  insertCount: number,
  updateCount: number,
): number {
  const deleteBatches =
    deleteIdCount > 0 ? Math.ceil(deleteIdCount / KNOWN_ID_DELETE_BATCH_SIZE) : 0
  const insertBatches = insertCount > 0 ? 1 : 0
  return deleteBatches + insertBatches + updateCount
}

export async function deleteKnownLineItemIds(
  supabase: SupabaseClient,
  table: GuideLineItemTable | string,
  settlementId: string,
  deleteIds: string[],
): Promise<LineItemPersistResult | { ok: true; requestCount: number }> {
  const unique = [...new Set(deleteIds)].filter(Boolean)
  if (unique.length === 0) return { ok: true, requestCount: 0 }

  let requestCount = 0
  for (let i = 0; i < unique.length; i += KNOWN_ID_DELETE_BATCH_SIZE) {
    const chunk = unique.slice(i, i + KNOWN_ID_DELETE_BATCH_SIZE)
    requestCount += 1
    const { error: delErr } = await supabase
      .from(table)
      .delete()
      .in('id', chunk)
      .eq('settlement_id', settlementId)
    if (delErr) {
      return { ok: false, error: delErr.message, table, step: 'orphan_delete', requestCount }
    }
  }

  return { ok: true, requestCount }
}

export async function persistGuideLineItemTable(
  supabase: SupabaseClient,
  table: GuideLineItemTable | string,
  settlementId: string,
  rows: Record<string, unknown>[],
  deleteIds: string[] = [],
  existingById?: Map<string, Record<string, unknown>>,
): Promise<LineItemPersistResult> {
  const { toInsert, toUpdate } = splitDbRowsForPersist(rows)
  const { rows: rowsToUpdate, skipped: updatesSkipped } = filterRowsNeedingUpdate(
    toUpdate,
    existingById,
    table,
  )
  let requestCount = 0

  const deleteResult = await deleteKnownLineItemIds(supabase, table, settlementId, deleteIds)
  if (!deleteResult.ok) return deleteResult
  requestCount += deleteResult.requestCount

  if (toInsert.length > 0) {
    requestCount += 1
    const { error: insErr } = await supabase.from(table).insert(toInsert)
    if (insErr) {
      return { ok: false, error: insErr.message, table, step: 'insert', requestCount }
    }
  }

  if (rowsToUpdate.length > 0) {
    const updateResults = await Promise.all(
      rowsToUpdate.map(async (row) => {
        const { id, ...patch } = row
        if (!id || typeof id !== 'string') return { error: null as null }
        const { error: updErr } = await supabase
          .from(table)
          .update(patch)
          .eq('id', id)
          .eq('settlement_id', settlementId)
        return { error: updErr }
      }),
    )
    requestCount += rowsToUpdate.length
    const failed = updateResults.find((r) => r.error)
    if (failed?.error) {
      return {
        ok: false,
        error: failed.error.message,
        table,
        step: 'update',
        requestCount,
      }
    }
  }

  return { ok: true, requestCount, updatesSkipped }
}
