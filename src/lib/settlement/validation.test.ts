import { describe, expect, it } from 'vitest'
import { emptyFormState } from './mappers'
import { emptyHotelRow } from './defaults'
import { hasGuideOwnedLineItemData } from './field-ownership'
import { validateSettlementForm, validationErrors } from './validation'

describe('hasGuideOwnedLineItemData', () => {
  it('counts guide hotel guide payment as line item', () => {
    expect(
      hasGuideOwnedLineItemData({
        hotels: [{ ...emptyHotelRow(), guide_amount_usd: 10, hotel_name: 'A' }],
      }),
    ).toBe(true)
  })

  it('does not count admin-only hotel unit prices alone', () => {
    expect(
      hasGuideOwnedLineItemData({
        hotels: [{ ...emptyHotelRow(), unit_price_sgl_usd: 100, hotel_name: '' }],
      }),
    ).toBe(false)
  })
})

describe('validateSettlementForm', () => {
  it('requires tour and positive exchange rate for draft', () => {
    const state = { ...emptyFormState('테스트'), exchange_rate: 0 }
    const issues = validateSettlementForm(state, 'draft')
    const errors = validationErrors(issues)
    expect(errors.some((e) => e.message.includes('투어'))).toBe(true)
    expect(errors.some((e) => e.message.includes('환율'))).toBe(true)
  })

  it('requires guide-owned line items on guide submit', () => {
    const state = {
      ...emptyFormState('테스트'),
      tourId: 't1',
      tour: { id: 't1' } as never,
      exchange_rate: 26000,
    }
    const errors = validationErrors(validateSettlementForm(state, 'submit', 'guide'))
    expect(errors.some((e) => e.message.includes('가이드 입력'))).toBe(true)
  })

  it('allows guide submit when line items exist', () => {
    const state = {
      ...emptyFormState('테스트'),
      tourId: 't1',
      tour: { id: 't1' } as never,
      exchange_rate: 26000,
      hotels: [{ ...emptyHotelRow(), clientId: '1', hotel_name: 'H', guide_amount_usd: 1, nights: 1 }],
    }
    const errors = validationErrors(validateSettlementForm(state, 'submit', 'guide'))
    expect(errors.length).toBe(0)
  })

  it('warns that admin-only fields are filled after submit', () => {
    const state = {
      ...emptyFormState('테스트'),
      tourId: 't1',
      tour: { id: 't1' } as never,
      exchange_rate: 26000,
      hotels: [{ ...emptyHotelRow(), clientId: '1', hotel_name: 'H', guide_amount_usd: 1, nights: 1 }],
    }
    const issues = validateSettlementForm(state, 'submit', 'guide')
    expect(issues.some((i) => i.message.includes('투어피/지상비'))).toBe(true)
  })
})
