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

  it('requires guide-owned line items on guide submit without tour fee', () => {
    const state = {
      ...emptyFormState('테스트'),
      tourId: 't1',
      tour: { id: 't1' } as never,
      exchange_rate: 26000,
      header: { ...emptyFormState('테스트').header, tour_fee_usd: 0 },
    }
    const errors = validationErrors(validateSettlementForm(state, 'submit', 'guide'))
    expect(errors.some((e) => e.message.includes('투어피'))).toBe(false)
    expect(errors.some((e) => e.message.includes('가이드 입력'))).toBe(true)
  })

  it('allows guide submit when tour fee is zero but line items exist', () => {
    const state = {
      ...emptyFormState('테스트'),
      tourId: 't1',
      tour: { id: 't1' } as never,
      exchange_rate: 26000,
      header: { ...emptyFormState('테스트').header, tour_fee_usd: 0 },
      hotels: [{ ...emptyHotelRow(), clientId: '1', hotel_name: 'H', guide_amount_usd: 1, nights: 1 }],
    }
    const errors = validationErrors(validateSettlementForm(state, 'submit', 'guide'))
    expect(errors.some((e) => e.message.includes('투어피'))).toBe(false)
    expect(errors.length).toBe(0)
  })

  it('warns that admin-owned fields include D79 on guide submit', () => {
    const state = {
      ...emptyFormState('테스트'),
      tourId: 't1',
      tour: { id: 't1' } as never,
      exchange_rate: 26000,
      header: { ...emptyFormState('테스트').header, tour_fee_usd: 120 },
      hotels: [{ ...emptyHotelRow(), clientId: '1', hotel_name: 'H', guide_amount_usd: 1, nights: 1 }],
    }
    const issues = validateSettlementForm(state, 'submit', 'guide')
    expect(issues.some((i) => i.message.includes('투어피(D79)'))).toBe(true)
  })
})
