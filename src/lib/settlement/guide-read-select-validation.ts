import type { SupabaseClient } from '@supabase/supabase-js'
import { GUIDE_READ } from '@/lib/supabase/guide-read-tables'
import {
  ENTRANCE_ITEMS_FULL_SELECT,
  HOTEL_ITEMS_FULL_SELECT,
  MEAL_ITEMS_FULL_SELECT,
  OPTION_ITEMS_FULL_SELECT,
  OTHER_EXPENSE_ITEMS_FULL_SELECT,
  RECEIPTS_FULL_SELECT,
  SETTLEMENT_FULL_SELECT,
  SHOPPING_ITEMS_FULL_SELECT,
} from './settlement-full-select'

export type GuideReadSelectCheck = {
  id: string
  view: string
  select: string
}

/** Read-only probe targets — mirrors tableForAudience() guide path in getSettlementFull. */
export const GUIDE_READ_SELECT_CHECKS: GuideReadSelectCheck[] = [
  { id: 'settlements', view: GUIDE_READ.settlements, select: SETTLEMENT_FULL_SELECT },
  { id: 'hotel_items', view: GUIDE_READ.hotel_items, select: HOTEL_ITEMS_FULL_SELECT },
  { id: 'meal_items', view: GUIDE_READ.meal_items, select: MEAL_ITEMS_FULL_SELECT },
  { id: 'entrance_items', view: GUIDE_READ.entrance_items, select: ENTRANCE_ITEMS_FULL_SELECT },
  {
    id: 'other_expense_items',
    view: GUIDE_READ.other_expense_items,
    select: OTHER_EXPENSE_ITEMS_FULL_SELECT,
  },
  { id: 'shopping_items', view: GUIDE_READ.shopping_items, select: SHOPPING_ITEMS_FULL_SELECT },
  { id: 'option_items', view: GUIDE_READ.option_items, select: OPTION_ITEMS_FULL_SELECT },
  { id: 'receipts', view: GUIDE_READ.receipts, select: RECEIPTS_FULL_SELECT },
]

export type GuideReadSelectValidationResult = {
  id: string
  view: string
  select: string
  ok: boolean
  error: string | null
}

/**
 * Read-only: issues SELECT … LIMIT 0 against guide *_guide_read views.
 * No inserts, updates, deletes, or RPC mutations.
 */
export async function validateGuideReadSelectsLive(
  client: SupabaseClient,
): Promise<GuideReadSelectValidationResult[]> {
  const results: GuideReadSelectValidationResult[] = []

  for (const check of GUIDE_READ_SELECT_CHECKS) {
    const { error } = await client.from(check.view).select(check.select).limit(0)
    results.push({
      id: check.id,
      view: check.view,
      select: check.select,
      ok: !error,
      error: error?.message ?? null,
    })
  }

  return results
}

export function allGuideReadSelectsPassed(results: GuideReadSelectValidationResult[]): boolean {
  return results.length > 0 && results.every((r) => r.ok)
}

export function supabaseProjectRefFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/i)
    return m?.[1] ?? null
  } catch {
    return null
  }
}
