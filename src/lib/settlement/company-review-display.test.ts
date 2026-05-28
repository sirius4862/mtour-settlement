import { describe, expect, it } from 'vitest'
import { companyReviewSubtotalField } from './company-review-display'

describe('companyReviewSubtotalField', () => {
  it('sums megugi and guide daily fee only', () => {
    const field = companyReviewSubtotalField({ megugi_usd: 3, guide_daily_fee_usd: 20 })
    expect(field.value).toBe(23)
    expect(field.excelRef).toBe('R80+R82')
    expect(field.formula).toBe('R80+R82')
  })

  it('does not include settlement pool (R84) or payout (R85)', () => {
    const field = companyReviewSubtotalField({ megugi_usd: 200, guide_daily_fee_usd: 15 })
    expect(field.value).toBe(215)
    expect(field.value).not.toBe(15781.54)
  })

  it('is not used as guide payout (P85 uses calc summary, not R80+R82)', () => {
    const subtotal = companyReviewSubtotalField({ megugi_usd: 3, guide_daily_fee_usd: 20 })
    expect(subtotal.excelRef).toBe('R80+R82')
    expect(subtotal.excelRef).not.toBe('P85')
  })
})
