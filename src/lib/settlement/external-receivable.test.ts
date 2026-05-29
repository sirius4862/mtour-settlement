import { describe, expect, it } from 'vitest'
import { calcSettlement } from './calc'
import type { SettlementCalcInput } from './types-calc'
import {
  externalReceivableDbFields,
  normalizeExternalReceivableForForm,
  resolveOptionCreditUsd,
} from './external-receivable'

const RATE = 26000

function cashInput(
  overrides: Partial<SettlementCalcInput['header']> = {},
  extra: Partial<SettlementCalcInput> = {},
): SettlementCalcInput {
  return {
    exchange_rate: RATE,
    header: {
      advance_vnd: 1_000_000,
      charming_other_usd: 0,
      tip_received_usd: 0,
      option_receivable_usd: 0,
      tip_transfer_usd: 0,
      ground_fee_usd: 0,
      vehicle_fee_usd: 0,
      head_tax_usd: 0,
      seoul_biz_fee_usd: 0,
      tc_guide_usd: 0,
      tc_company_usd: 0,
      megugi_usd: 0,
      guide_daily_fee_usd: 0,
      settlement_ratio: 0.5,
      ...overrides,
    },
    hotels: [],
    meals: [],
    entrances: [],
    others: [],
    company_expenses: [],
    shoppings: [],
    options: [],
    ...extra,
  }
}

describe('resolveOptionCreditUsd', () => {
  it('uses split fields when present', () => {
    expect(
      resolveOptionCreditUsd({
        option_receivable_usd: 30,
        tip_transfer_usd: 20,
        option_credit_usd: 999,
      }),
    ).toBe(50)
  })

  it('falls back to legacy option_credit_usd when split fields are empty', () => {
    expect(
      resolveOptionCreditUsd({
        option_receivable_usd: 0,
        tip_transfer_usd: 0,
        option_credit_usd: 75,
      }),
    ).toBe(75)
  })
})

describe('normalizeExternalReceivableForForm', () => {
  it('maps legacy option_credit_usd into option_receivable_usd for display', () => {
    expect(
      normalizeExternalReceivableForForm({
        option_receivable_usd: 0,
        tip_transfer_usd: 0,
        option_credit_usd: 75,
      }),
    ).toEqual({ option_receivable_usd: 75, tip_transfer_usd: 0 })
  })
})

describe('externalReceivableDbFields', () => {
  it('keeps legacy option_credit_usd equal to split sum', () => {
    expect(
      externalReceivableDbFields({
        option_receivable_usd: 40,
        tip_transfer_usd: 10,
      }),
    ).toEqual({
      option_receivable_usd: 40,
      tip_transfer_usd: 10,
      option_credit_usd: 50,
    })
  })
})

describe('external receivable Q75 policy', () => {
  it('1: option_receivable_usd increases P75 and reduces Q75', () => {
    const base = calcSettlement(cashInput())
    const withReceivable = calcSettlement(
      cashInput({ option_receivable_usd: 25 }),
    )

    expect(withReceivable.sections.cash.option_credit_usd.value).toBe(25)
    expect(
      base.sections.cash.company_deposit_usd.value -
        withReceivable.sections.cash.company_deposit_usd.value,
    ).toBeCloseTo(25, 2)
  })

  it('2: tip_transfer_usd increases P75 and reduces Q75', () => {
    const base = calcSettlement(cashInput())
    const withTransfer = calcSettlement(cashInput({ tip_transfer_usd: 15 }))

    expect(withTransfer.sections.cash.option_credit_usd.value).toBe(15)
    expect(
      base.sections.cash.company_deposit_usd.value -
        withTransfer.sections.cash.company_deposit_usd.value,
    ).toBeCloseTo(15, 2)
  })

  it('3: split fields together match legacy P75 behavior', () => {
    const legacy = calcSettlement(cashInput({ option_credit_usd: 60 }))
    const split = calcSettlement(
      cashInput({ option_receivable_usd: 35, tip_transfer_usd: 25 }),
    )

    expect(split.sections.cash.option_credit_usd.value).toBe(60)
    expect(split.sections.cash.company_deposit_usd.value).toBeCloseTo(
      legacy.sections.cash.company_deposit_usd.value,
      2,
    )
  })

  it('4: guide payout unchanged by receivable fields alone', () => {
    const base = calcSettlement(
      cashInput({
        tip_received_usd: 50,
        option_receivable_usd: 0,
        tip_transfer_usd: 0,
      }),
    )
    const withReceivable = calcSettlement(
      cashInput({
        tip_received_usd: 50,
        option_receivable_usd: 40,
        tip_transfer_usd: 20,
      }),
    )

    expect(withReceivable.summary.guide_payout_usd.value).toBe(
      base.summary.guide_payout_usd.value,
    )
    expect(withReceivable.summary.guide_settlement_usd.value).toBe(
      base.summary.guide_settlement_usd.value,
    )
  })
})
