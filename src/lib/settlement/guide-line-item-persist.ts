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
export async function persistGuideLineItemTable(
  supabase: SupabaseClient,
  table: GuideLineItemTable | string,
  settlementId: string,
  rows: Record<string, unknown>[],
): Promise<{ ok: boolean; error?: string }> {
  const { keepIds, toInsert, toUpdate } = splitDbRowsForPersist(rows)

  let deleteQuery = supabase.from(table).delete().eq('settlement_id', settlementId)
  if (keepIds.length > 0) {
    deleteQuery = deleteQuery.not('id', 'in', `(${keepIds.map((id) => `"${id}"`).join(',')})`)
  }
  const { error: delErr } = await deleteQuery
  if (delErr) return { ok: false, error: delErr.message }

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
