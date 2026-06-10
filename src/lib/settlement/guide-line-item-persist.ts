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
  | { ok: true }
  | { ok: false; error: string; table: string; step: LineItemPersistStep }

/**
 * Replace line items for one table without upsert/RETURNING.
 * Hardening removed guide SELECT on base line-item tables; upsert and
 * INSERT…RETURNING require SELECT and fail RLS on hotel/meal/etc.
 *
 * Persist semantics: delete orphan DB rows (not in payload keepIds), then insert
 * new rows and update existing rows. Repeated saves with the same payload are
 * idempotent and must not multiply rows.
 */
/** Soft-deleted draft rows with DB ids — guides cannot SELECT base line-item tables (RLS). */
export function explicitDeleteIdsFromDraft(
  rows: Array<{ deleted?: boolean; id?: string }>,
): string[] {
  return rows.filter((r) => r.deleted && r.id).map((r) => r.id as string)
}

export async function persistGuideLineItemTable(
  supabase: SupabaseClient,
  table: GuideLineItemTable | string,
  settlementId: string,
  rows: Record<string, unknown>[],
  explicitDeleteIds: string[] = [],
): Promise<LineItemPersistResult> {
  const { keepIds, toInsert, toUpdate } = splitDbRowsForPersist(rows)

  // Remove DB rows no longer present in the payload (replace semantics).
  let orphanDeleteQuery = supabase
    .from(table)
    .delete({ count: 'exact' })
    .eq('settlement_id', settlementId)
  if (keepIds.length > 0) {
    orphanDeleteQuery = orphanDeleteQuery.not(
      'id',
      'in',
      `(${keepIds.map((id) => `"${id}"`).join(',')})`,
    )
  }
  const { error: orphanDelErr } = await orphanDeleteQuery
  if (orphanDelErr) {
    return { ok: false, error: orphanDelErr.message, table, step: 'orphan_delete' }
  }

  for (const id of explicitDeleteIds) {
    const { error: delErr, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('settlement_id', settlementId)
    if (delErr) {
      return { ok: false, error: delErr.message, table, step: 'explicit_delete' }
    }
    // Idempotent: stale session ids after cleanup or a never-persisted row are no-ops.
    if ((count ?? 0) < 1) continue
  }

  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from(table).insert(toInsert)
    if (insErr) return { ok: false, error: insErr.message, table, step: 'insert' }
  }

  for (const row of toUpdate) {
    const { id, ...patch } = row
    if (!id || typeof id !== 'string') continue
    const { error: updErr } = await supabase
      .from(table)
      .update(patch)
      .eq('id', id)
      .eq('settlement_id', settlementId)
    if (updErr) return { ok: false, error: updErr.message, table, step: 'update' }
  }

  return { ok: true }
}
