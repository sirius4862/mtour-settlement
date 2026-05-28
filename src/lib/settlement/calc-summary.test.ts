import { describe, expect, it } from 'vitest'
import { formatAdminListUsd, parseSettlementCalcSummaryJson } from './calc-summary'

describe('parseSettlementCalcSummaryJson', () => {
  it('parses valid summary', () => {
    expect(
      parseSettlementCalcSummaryJson({
        company_deposit_usd: 79.62,
        guide_settlement_usd: 258.5,
        guide_payout_usd: 258.5,
        company_grand_total_usd: -328.88,
      }),
    ).toEqual({
      company_deposit_usd: 79.62,
      guide_settlement_usd: 258.5,
      guide_payout_usd: 258.5,
      company_grand_total_usd: -328.88,
    })
  })

  it('returns null for invalid payload', () => {
    expect(parseSettlementCalcSummaryJson(null)).toBeNull()
    expect(parseSettlementCalcSummaryJson({ company_deposit_usd: 'x' })).toBeNull()
  })
})

describe('formatAdminListUsd', () => {
  it('formats negative Q75', () => {
    expect(formatAdminListUsd(-12.5)).toBe('-$12.50')
  })

  it('shows dash for zero or null', () => {
    expect(formatAdminListUsd(0)).toBe('—')
    expect(formatAdminListUsd(null)).toBe('—')
  })
})
