import { describe, expect, it } from 'vitest'
import { calcSettlement } from './calc'
import { buildSettlementSummaryView } from './settlement-summary-view'
import { MOCK_SETTLEMENT_INPUT } from './mock-data'

describe('buildSettlementSummaryView', () => {
  it('maps COM total as settlement revenue basis with reference income lines', () => {
    const result = calcSettlement(MOCK_SETTLEMENT_INPUT)
    const view = buildSettlementSummaryView(result)

    expect(view.revenue.helperText).toContain('쇼핑 COM + 옵션 COM')
    expect(view.revenue.lines.find((l) => l.key === 'com-total')?.amount).toBe(
      result.summary.income_total_usd.value,
    )
    expect(view.revenue.lines.find((l) => l.key === 'extra-income')?.variant).toBe('muted')
    expect(view.revenue.lines.find((l) => l.key === 'tips')?.variant).toBe('muted')

    expect(view.deductions.lines.find((l) => l.key === 'megugi')?.variant).toBe('deduct')
    expect(view.deductions.lines.find((l) => l.key === 'tc')?.variant).toBe('deduct')
    expect(view.deductions.lines.find((l) => l.key === 'guide-expense')?.variant).toBe('muted')

    expect(view.balance.lines[0].amount).toBe(result.summary.balance_usd.value)
    expect(view.otherDeductionBreakdown.map((l) => l.label)).toEqual([
      '차량비',
      '인두세',
      '서울영업비',
    ])
  })
})
