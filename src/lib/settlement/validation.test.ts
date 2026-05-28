import { describe, expect, it } from 'vitest'
import { emptyFormState } from './mappers'
import { validateSettlementForm, validationErrors } from './validation'

describe('validateSettlementForm', () => {
  it('requires tour and positive exchange rate for draft', () => {
    const state = { ...emptyFormState('테스트'), exchange_rate: 0 }
    const issues = validateSettlementForm(state, 'draft')
    const errors = validationErrors(issues)
    expect(errors.some((e) => e.message.includes('투어'))).toBe(true)
    expect(errors.some((e) => e.message.includes('환율'))).toBe(true)
  })

  it('requires tour fee and line items on submit', () => {
    const state = {
      ...emptyFormState('테스트'),
      tourId: 't1',
      tour: { id: 't1' } as never,
      exchange_rate: 26000,
    }
    const errors = validationErrors(validateSettlementForm(state, 'submit'))
    expect(errors.some((e) => e.message.includes('투어피'))).toBe(true)
    expect(errors.some((e) => e.message.includes('항목'))).toBe(true)
  })
})
