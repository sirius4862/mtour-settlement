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

/**
 * Replace line items for one table without upsert/RETURNING.
 * Hardening removed guide SELECT on base line-item tables; upsert and
 * INSERT…RETURNING require SELECT and fail RLS on hotel/meal/etc.
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
): Promise<{ ok: boolean; error?: string }> {
  const { keepIds, toInsert, toUpdate } = splitDbRowsForPersist(rows)

  for (const id of explicitDeleteIds) {
    const { error: delErr, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('settlement_id', settlementId)
    if (delErr) return { ok: false, error: delErr.message }
    if ((count ?? 0) < 1) {
      return { ok: false, error: `line_item_delete_failed:${table}:${id}` }
    }
  }

  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from(table).insert(toInsert)
    if (insErr) return { ok: false, error: insErr.message }
  }

  for (const row of toUpdate) {
    const { id, ...patch } = row
    if (!id || typeof id !== 'string') continue
    const { error: updErr } = await supabase
      .from(table)
      .update(patch)
      .eq('id', id)
      .eq('settlement_id', settlementId)
    if (updErr) return { ok: false, error: updErr.message }
  }

  return { ok: true }
}
