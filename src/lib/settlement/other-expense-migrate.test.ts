import { describe, expect, it } from 'vitest'
import {
  calcOtherAmountUsd,
  calcOtherAmountVnd,
  calcOtherRowCombinedUsd,
  calcOtherSubtotals,
  calcSettlement,
  vndToUsd,
} from './calc'
import { MOCK_LEGACY_OTHER_ROWS, MOCK_SETTLEMENT_INPUT } from './mock-data'
import { normalizeOtherAmountsFromDb } from './other-expense-migrate'
import type { OtherExpenseItem } from '@/types'

const RATE = 26000

function legacyFlatOthers() {
  return MOCK_LEGACY_OTHER_ROWS.map((row) => ({
    amount_usd: calcOtherAmountUsd(row),
    amount_vnd: calcOtherAmountVnd(row),
  }))
}

function legacyOtherItem(
  overrides: Partial<OtherExpenseItem> & Pick<OtherExpenseItem, 'id'>,
): OtherExpenseItem {
  return {
    settlement_id: 's1',
    description: 'Legacy row',
    days: null,
    pax: 0,
    unit_price_usd: 0,
    unit_price_vnd: 0,
    amount_usd: 0,
    amount_vnd: 0,
    is_tip: false,
    note: null,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('normalizeOtherAmountsFromDb', () => {
  it('reads flat rows directly from stored amounts', () => {
    const row = legacyOtherItem({
      id: '1',
      entry_mode: 'flat',
      amount_usd: 20,
      amount_vnd: 50_000,
    })
    expect(normalizeOtherAmountsFromDb(row)).toEqual({
      amount_usd: 20,
      amount_vnd: 50_000,
    })
  })

  it('derives flat amounts from legacy unit formula', () => {
    const legacy = MOCK_LEGACY_OTHER_ROWS[0]
    const row = legacyOtherItem({
      id: '1',
      entry_mode: 'legacy',
      days: legacy.days,
      pax: legacy.pax,
      unit_price_usd: legacy.unit_price_usd,
      unit_price_vnd: legacy.unit_price_vnd,
      is_tip: legacy.use_days_for_usd ?? false,
    })
    expect(normalizeOtherAmountsFromDb(row)).toEqual({
      amount_usd: 40,
      amount_vnd: 0,
    })
  })
})

describe('flat other expenses J53 parity', () => {
  it('legacy formula rows match flat amount rows for combined_usd', () => {
    const flatRows = legacyFlatOthers()
    const legacyCombined = calcOtherSubtotals(flatRows, RATE).combined_usd.value

    const fromLegacyInputs = MOCK_LEGACY_OTHER_ROWS.map((row) => ({
      amount_usd: calcOtherAmountUsd(row),
      amount_vnd: calcOtherAmountVnd(row),
    }))
    const flatCombined = calcOtherSubtotals(fromLegacyInputs, RATE).combined_usd.value

    expect(flatCombined).toBeCloseTo(legacyCombined, 6)
  })

  it('MOCK_SETTLEMENT_INPUT flat others preserve settlement cash path totals', () => {
    const flatInput = {
      ...MOCK_SETTLEMENT_INPUT,
      others: legacyFlatOthers(),
    }
    const baseline = calcSettlement(MOCK_SETTLEMENT_INPUT)
    const migrated = calcSettlement(flatInput)

    expect(migrated.sections.others.combined_usd.value).toBeCloseTo(
      baseline.sections.others.combined_usd.value,
      6,
    )
    expect(migrated.sections.cash.company_deposit_usd.value).toBeCloseTo(
      baseline.sections.cash.company_deposit_usd.value,
      6,
    )
    expect(migrated.summary.guide_settlement_usd.value).toBe(
      baseline.summary.guide_settlement_usd.value,
    )
    expect(migrated.summary.company_grand_total_usd.value).toBeCloseTo(
      baseline.summary.company_grand_total_usd.value,
      6,
    )
  })

  it('row combined uses amount_usd + vnd/rate', () => {
    expect(calcOtherRowCombinedUsd({ amount_usd: 10, amount_vnd: 26_000 }, RATE)).toBeCloseTo(11, 6)
    expect(vndToUsd(26_000, RATE)).toBe(1)
  })
})
