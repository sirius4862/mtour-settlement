import { calcOtherAmountUsd, calcOtherAmountVnd } from './calc'
import type { OtherExpenseEntryMode, LegacyOtherExpenseInput } from './types-calc'
import type { OtherExpenseItem } from '@/types'

/** Internal only — not shown in UI. */
export function resolveOtherEntryMode(row: Pick<OtherExpenseItem, 'entry_mode'>): OtherExpenseEntryMode {
  return row.entry_mode === 'flat' ? 'flat' : 'legacy'
}

export function legacyOtherInputFromDb(
  row: Pick<
    OtherExpenseItem,
    'days' | 'pax' | 'unit_price_usd' | 'unit_price_vnd' | 'is_tip'
  >,
): LegacyOtherExpenseInput {
  return {
    days: row.days,
    pax: row.pax,
    unit_price_usd: row.unit_price_usd,
    unit_price_vnd: row.unit_price_vnd,
    use_days_for_usd: row.is_tip,
  }
}

/** Normalize DB row to flat amounts for form + calc (preserves legacy J53 totals). */
export function normalizeOtherAmountsFromDb(row: OtherExpenseItem): {
  amount_usd: number
  amount_vnd: number
} {
  if (resolveOtherEntryMode(row) === 'flat') {
    return {
      amount_usd: row.amount_usd,
      amount_vnd: row.amount_vnd,
    }
  }
  const legacy = legacyOtherInputFromDb(row)
  return {
    amount_usd: calcOtherAmountUsd(legacy),
    amount_vnd: calcOtherAmountVnd(legacy),
  }
}
