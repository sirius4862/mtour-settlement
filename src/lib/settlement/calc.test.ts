import { describe, expect, it } from 'vitest'
import {
  activeRows,
  calcEntranceAmountVnd,
  calcExtraVehicleUsd,
  calcHotelCompanyUsd,
  calcHotelRow,
  calcMealAmountVnd,
  calcOptionRowComUsd,
  calcOptionSubtotals,
  calcOptionTotalSaleUsd,
  calcOtherAmountUsd,
  calcOtherAmountVnd,
  calcSettlement,
  vndToUsd,
} from './calc'
import type { SettlementCalcInput } from './types-calc'
import { MOCK_SETTLEMENT_INPUT } from './mock-data'

const RATE = 26000

function emptyInput(overrides: Partial<SettlementCalcInput> = {}): SettlementCalcInput {
  return {
    exchange_rate: RATE,
    header: {
      advance_vnd: 0,
      charming_other_usd: 0,
      tip_received_usd: 0,
      option_credit_usd: 0,
      tour_fee_usd: 0,
      vehicle_fee_usd: 0,
      head_tax_usd: 0,
      seoul_biz_fee_usd: 0,
      tc_guide_usd: 0,
      tc_company_usd: 0,
      megugi_usd: 0,
      guide_daily_fee_usd: 0,
      settlement_ratio: 0.5,
    },
    hotels: [],
    meals: [],
    entrances: [],
    others: [],
    shoppings: [],
    options: [],
    ...overrides,
  }
}

describe('vndToUsd', () => {
  it('converts VND to USD using Q2', () => {
    expect(vndToUsd(26000, RATE)).toBe(1)
    expect(vndToUsd(130000, RATE)).toBe(5)
  })

  it('returns 0 when exchange rate is 0', () => {
    expect(vndToUsd(1000, 0)).toBe(0)
  })

  it('handles negative VND deterministically', () => {
    expect(vndToUsd(-26000, RATE)).toBe(-1)
  })
})

describe('hotel calculations', () => {
  it('P8: company = (SGL+TWN)×N×M + TRP×N×O', () => {
    const row = {
      sgl_count: 2,
      twn_count: 1,
      trp_count: 0,
      nights: 3,
      unit_price_sgl_usd: 10,
      unit_price_trp_usd: 8,
      guide_amount_usd: 0,
    }
    // (2+1)*3*10 + 0 = 90
    expect(calcHotelCompanyUsd(row)).toBe(90)
  })

  it('includes TRP rooms in company amount', () => {
    const row = {
      sgl_count: 0,
      twn_count: 0,
      trp_count: 2,
      nights: 2,
      unit_price_sgl_usd: 10,
      unit_price_trp_usd: 15,
      guide_amount_usd: 5,
    }
    expect(calcHotelCompanyUsd(row)).toBe(60)
  })

  it('calcHotelRow annotates formula metadata', () => {
    const result = calcHotelRow({
      sgl_count: 1,
      twn_count: 0,
      trp_count: 0,
      nights: 1,
      unit_price_sgl_usd: 20,
      unit_price_trp_usd: 0,
      guide_amount_usd: 12,
    })
    expect(result.company_amount_usd.value).toBe(20)
    expect(result.company_amount_usd.excelRef).toBe('P8')
    expect(result.guide_amount_usd.value).toBe(12)
    expect(result.guide_amount_usd.formula).toBe('수동 입력')
  })

  it('excludes soft-deleted rows from section totals', () => {
    const result = calcSettlement(
      emptyInput({
        hotels: [
          { sgl_count: 1, twn_count: 0, trp_count: 0, nights: 1, unit_price_sgl_usd: 100, unit_price_trp_usd: 0, guide_amount_usd: 10 },
          { sgl_count: 9, twn_count: 0, trp_count: 0, nights: 1, unit_price_sgl_usd: 100, unit_price_trp_usd: 0, guide_amount_usd: 10, deleted: true },
        ],
      }),
    )
    expect(result.sections.hotels.company_total_usd.value).toBe(100)
    expect(result.sections.hotels.guide_total_usd.value).toBe(10)
  })
})

describe('option COM calculations', () => {
  it('O57: total sale = unit × pax', () => {
    expect(calcOptionTotalSaleUsd({ unit_price_usd: 30, pax: 4, expense_usd: 0, expense_vnd: 0 })).toBe(120)
  })

  it('S57: row COM = O − P − Q/Q2', () => {
    const row = { unit_price_usd: 50, pax: 2, expense_usd: 10, expense_vnd: 26000 }
    // O=100, P=10, Q/Q2=1 → COM=89
    expect(calcOptionRowComUsd(row, RATE)).toBe(89)
  })

  it('S72 total uses O72−Q72−P72 (not sum of row COMs)', () => {
    const options = [
      { unit_price_usd: 10, pax: 10, expense_usd: 5, expense_vnd: 0 },       // O=100
      { unit_price_usd: 20, pax: 5, expense_usd: 10, expense_vnd: 26000 },    // O=100
    ]
    const sub = calcOptionSubtotals(options, RATE)
    // O72=200, P72=15, Q72=26000/26000=1 → S72=184
    expect(sub.total_sale_usd.value).toBe(200)
    expect(sub.expense_usd.value).toBe(15)
    expect(sub.expense_vnd_usd.value).toBe(1)
    expect(sub.com_usd.value).toBe(184)
    expect(sub.com_usd.formula).toBe('O72−Q72−P72')
  })

  it('extra vehicle S75 = P71 + Q71/Q2', () => {
    const row = { unit_price_usd: 0, pax: 0, expense_usd: 20, expense_vnd: 52000, is_extra_vehicle: true }
    expect(calcExtraVehicleUsd(row, RATE)).toBe(22)
  })

  it('0 pax yields 0 option sale', () => {
    expect(calcOptionTotalSaleUsd({ unit_price_usd: 100, pax: 0, expense_usd: 0, expense_vnd: 0 })).toBe(0)
    expect(calcOptionRowComUsd({ unit_price_usd: 100, pax: 0, expense_usd: 5, expense_vnd: 0 }, RATE)).toBe(-5)
  })
})

describe('meal, entrance, other edge cases', () => {
  it('0 pax meal = 0 VND', () => {
    expect(calcMealAmountVnd({ pax: 0, unit_price_vnd: 50000 })).toBe(0)
  })

  it('other USD with days: D×E×F', () => {
    expect(
      calcOtherAmountUsd({ days: 4, pax: 2, unit_price_usd: 10, unit_price_vnd: 0, use_days_for_usd: true }),
    ).toBe(80)
  })

  it('other USD without days: E×F', () => {
    expect(
      calcOtherAmountUsd({ days: null, pax: 3, unit_price_usd: 7, unit_price_vnd: 0 }),
    ).toBe(21)
  })

  it('other VND: O×P', () => {
    expect(calcOtherAmountVnd({ days: null, pax: 2, unit_price_usd: 0, unit_price_vnd: 15000 })).toBe(30000)
  })

  it('empty rows contribute 0 to settlement', () => {
    const result = calcSettlement(emptyInput())
    expect(result.summary.income_total_usd.value).toBe(0)
    expect(result.summary.guide_settlement_usd.value).toBe(0)
  })
})

describe('settlement matrix', () => {
  it('computes full matrix deterministically from known inputs', () => {
    const result = calcSettlement(
      emptyInput({
        header: {
          advance_vnd: 260000,
          charming_other_usd: 10,
          tip_received_usd: 5,
          option_credit_usd: 0,
          tour_fee_usd: 100,
          vehicle_fee_usd: 20,
          head_tax_usd: 5,
          seoul_biz_fee_usd: 3,
          tc_guide_usd: 8,
          tc_company_usd: 4,
          megugi_usd: 2,
          guide_daily_fee_usd: 15,
          settlement_ratio: 0.5,
        },
        hotels: [
          { sgl_count: 1, twn_count: 0, trp_count: 0, nights: 2, unit_price_sgl_usd: 25, unit_price_trp_usd: 0, guide_amount_usd: 10 },
        ],
        meals: [{ pax: 2, unit_price_vnd: 130000 }],
        shoppings: [{ sale_usd: 50, com_usd: 20, kb_usd: 5 }],
        options: [{ unit_price_usd: 10, pax: 5, expense_usd: 5, expense_vnd: 0 }],
      }),
    )

    // Hotel company = 50, guide = 10
    expect(result.sections.hotels.company_total_usd.value).toBe(50)
    // Meals J24=260000 → J25=10
    expect(result.sections.meals.total_usd.value).toBe(10)
    // Shopping D72=50, F72=20 → D80=70
    // Option O72=50, P72=5, Q72=0 → S72=45
    expect(result.sections.options.com_usd.value).toBe(45)

    // D84 = 100 + 70 + 45 + 5 + 10 = 230
    expect(result.summary.income_total_usd.value).toBe(230)

    // R79 = 70+45 = 115, R84 = 115-2-12 = 101, R85 = 101*0.5+15 = 65.5
    expect(result.summary.balance_usd.value).toBe(101)
    expect(result.summary.guide_settlement_usd.value).toBe(65.5)

    // Matrix has Excel-like rows including R87
    expect(result.matrix.some((r) => r.key === 'r84' && r.isSubtotal)).toBe(true)
    expect(result.matrix.find((r) => r.key === 'r87')?.settlement?.excelRef).toBe('R87')
  })

  it('negative values propagate deterministically', () => {
    const result = calcSettlement(
      emptyInput({
        header: {
          ...emptyInput().header,
          tour_fee_usd: -10,
          megugi_usd: 0,
          guide_daily_fee_usd: 0,
        },
        shoppings: [{ sale_usd: -5, com_usd: 0, kb_usd: 0 }],
      }),
    )
    expect(result.summary.income_total_usd.value).toBe(-15)
  })

  it('every summary field includes label and formula', () => {
    const result = calcSettlement(emptyInput())
    for (const field of Object.values(result.summary)) {
      expect(field.label).toBeTruthy()
      expect(field.excelRef).toMatch(/^[A-Z]+\d+$/)
      expect(field.formula).toBeTruthy()
    }
  })
})

describe('MOCK_SETTLEMENT_INPUT golden totals', () => {
  it('matches Excel-derived section and matrix totals', () => {
    const result = calcSettlement(MOCK_SETTLEMENT_INPUT)

    expect(result.sections.hotels.company_total_usd.value).toBe(300)
    expect(result.sections.hotels.guide_total_usd.value).toBe(23)
    expect(result.sections.meals.total_vnd.value).toBe(4_830_000)
    expect(result.sections.meals.total_usd.value).toBeCloseTo(185.769230769, 4)
    expect(result.sections.entrances.total_usd.value).toBeCloseTo(159.230769230, 4)
    expect(result.sections.shopping.com_usd.value).toBe(60)
    expect(result.sections.shopping.kb_usd.value).toBe(16)
    expect(result.sections.options.com_usd.value).toBe(240)
    expect(result.sections.options.extra_vehicle_usd.value).toBe(65)

    expect(result.summary.income_total_usd.value).toBe(695)
    expect(result.summary.balance_usd.value).toBe(477)
    expect(result.summary.guide_settlement_usd.value).toBe(258.5)
    expect(result.summary.company_grand_total_usd.value).toBeCloseTo(-328.884615384, 4)

    expect(result.matrix).toHaveLength(9)
    expect(result.matrix.map((r) => r.key)).toEqual([
      'r79', 'r80', 'r81', 'r82', 'r83', 'r84', 'r85', 'r86', 'r87',
    ])
  })
})

describe('activeRows', () => {
  it('filters deleted rows only', () => {
    expect(activeRows([{ deleted: false }, { deleted: true }, {}])).toHaveLength(2)
  })
})
