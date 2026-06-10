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
  | { ok: true; requestCount: number }
  | { ok: false; error: string; table: string; step: LineItemPersistStep; requestCount: number }

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
): Promise<LineItemPersistResult> {
  const { toInsert, toUpdate } = splitDbRowsForPersist(rows)
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

  if (toUpdate.length > 0) {
    const updateResults = await Promise.all(
      toUpdate.map(async (row) => {
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
    requestCount += toUpdate.length
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

  return { ok: true, requestCount }
}
