import { describe, expect, it } from 'vitest'
import { annotate } from './calc'
import {
  displayFieldLabel,
  GUIDE_FOOTER_LABELS,
  GUIDE_PAYOUT_FLOOR_WARNING,
  Q75_NEGATIVE_WARNING,
  companyDepositIsNegative,
  guideDisplaySettlementUsd,
  guideSettlementIsNegative,
  shouldShowSummaryField,
} from './display-labels'

describe('displayFieldLabel', () => {
  it('maps R87 to 회사수익 for admin', () => {
    const field = annotate(100, '최종 회사총수익', 'R87', 'formula')
    expect(displayFieldLabel(field, 'admin')).toBe('회사수익')
  })

  it('maps guide footer labels', () => {
    expect(displayFieldLabel(annotate(50, '회사입금액', 'Q75', 'f'), 'guide')).toBe(
      GUIDE_FOOTER_LABELS.companyDeposit,
    )
    expect(displayFieldLabel(annotate(0, '실제 지급액', 'P85', 'f'), 'guide')).toBe(
      GUIDE_FOOTER_LABELS.guideSettlement,
    )
  })

  it('maps P85 to 실제 지급액 for admin', () => {
    const field = annotate(0, '실제 지급액', 'P85', 'MAX(R85,0)')
    expect(displayFieldLabel(field, 'admin')).toBe('실제 지급액')
  })

  it('maps R85 to 계산상 가이드정산 for admin', () => {
    const field = annotate(-10, '가이드정산', 'R85', 'R84×R77+R82')
    expect(displayFieldLabel(field, 'admin')).toBe('계산상 가이드정산')
  })

  it('maps F86/R86 for admin internal labels', () => {
    expect(displayFieldLabel(annotate(1, '회사총수익', 'F86', 'f'), 'admin')).toBe('수익−지출')
    expect(displayFieldLabel(annotate(1, '회사수익', 'R86', 'f'), 'admin')).toBe('회사수익 중간값')
  })
})

describe('guide payout floor', () => {
  it('detects negative guide settlement', () => {
    expect(guideSettlementIsNegative(-1)).toBe(true)
    expect(guideSettlementIsNegative(0)).toBe(false)
  })

  it('floors guide display amount at zero', () => {
    expect(guideDisplaySettlementUsd(-12.5)).toBe(0)
    expect(guideDisplaySettlementUsd(12.5)).toBe(12.5)
  })

  it('includes floor warning message', () => {
    expect(GUIDE_PAYOUT_FLOOR_WARNING).toContain('$0')
  })

  it('includes company deposit negative warning', () => {
    expect(Q75_NEGATIVE_WARNING).toContain('회사입금')
    expect(companyDepositIsNegative(-1)).toBe(true)
    expect(companyDepositIsNegative(0)).toBe(false)
  })
})

describe('visibility rules', () => {
  it('hides company summary fields from guide', () => {
    const r86 = annotate(1, '회사수익', 'R86', 'f')
    const r87 = annotate(2, '최종 회사총수익', 'R87', 'f')
    const h85 = annotate(3, '지출 총액', 'H85', 'f')
    expect(shouldShowSummaryField(r86, 'guide')).toBe(false)
    expect(shouldShowSummaryField(r87, 'guide')).toBe(false)
    expect(shouldShowSummaryField(h85, 'guide')).toBe(false)
    expect(shouldShowSummaryField(r87, 'admin')).toBe(true)
  })
})
