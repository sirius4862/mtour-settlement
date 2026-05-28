import { describe, expect, it } from 'vitest'
import {
  activeRows,
  calcEntranceAmountVnd,
  calcExtraVehicleUsd,
  calcExpenseTotalH85,
  calcGuideSettlementFromProfitPool,
  calcHotelCompanyUsd,
  calcHotelRow,
  calcMealAmountVnd,
  calcOptionRowComUsd,
  calcOptionSubtotals,
  calcOptionTotalSaleUsd,
  calcOtherAmountUsd,
  calcOtherAmountVnd,
  calcSettlement,
  calcShoppingActualProfitUsd,
  calcShoppingIncomeD80,
  vndToUsd,
} from './calc'
import type { SettlementCalcInput } from './types-calc'
import { MOCK_SETTLEMENT_INPUT } from './mock-data'
import { verifySettlementAgainstExcel } from './excel-tolerance'

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

/** Build minimal input where F72=shoppingProfit (COM) and D81=optionProfit. */
function policyTestInput(
  shoppingProfit: number,
  optionProfit: number,
  megugi: number,
  dailyFee: number,
): SettlementCalcInput {
  return emptyInput({
    header: {
      ...emptyInput().header,
      megugi_usd: megugi,
      guide_daily_fee_usd: dailyFee,
    },
    shoppings: [{ sale_usd: 0, com_usd: shoppingProfit, kb_usd: 0 }],
    options: [{ unit_price_usd: optionProfit, pax: 1, expense_usd: 0, expense_vnd: 0 }],
  })
}

/** Screen-like input: large SALE + COM commission (F72 drives guide payout). */
function screenLikeInput(
  saleUsd: number,
  comUsd: number,
  optionComUsd: number,
  megugi: number,
  dailyFee: number,
): SettlementCalcInput {
  return emptyInput({
    header: {
      ...emptyInput().header,
      megugi_usd: megugi,
      guide_daily_fee_usd: dailyFee,
    },
    shoppings: [{ sale_usd: saleUsd, com_usd: comUsd, kb_usd: 0 }],
    options: [{ unit_price_usd: optionComUsd, pax: 1, expense_usd: 0, expense_vnd: 0 }],
  })
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

    // D84 = 100 + 20 + 45 + 5 + 10 = 180 (D80=COM only)
    expect(result.summary.income_total_usd.value).toBe(180)

    // R79 = 20+45 = 65, R84 = 65-2-12 = 51
    expect(result.summary.balance_usd.value).toBe(51)
    expect(result.summary.guide_settlement_usd.value).toBe(46.5)

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
    expect(result.summary.income_total_usd.value).toBe(-10)
  })

  it('every summary field includes label and formula', () => {
    const result = calcSettlement(emptyInput())
    for (const field of Object.values(result.summary)) {
      expect(field.label).toBeTruthy()
      expect(field.excelRef).toMatch(/^[A-Z]+\d+$/)
      expect(field.formula).toBeTruthy()
    }
  })

  it('floors guide profit share at zero when pool is negative but keeps daily fee', () => {
    const result = calcSettlement(
      emptyInput({
        header: {
          ...emptyInput().header,
          megugi_usd: 200,
          settlement_ratio: 0.5,
          guide_daily_fee_usd: 5,
          tc_guide_usd: 30,
          tc_company_usd: 20,
        },
        shoppings: [{ sale_usd: 20, com_usd: 10, kb_usd: 0 }],
        options: [{ unit_price_usd: 10, pax: 3, expense_usd: 5, expense_vnd: 0 }],
      }),
    )

    expect(result.summary.guide_settlement_usd.excelRef).toBe('R85')
    expect(result.summary.guide_settlement_usd.value).toBe(5)
    expect(result.summary.guide_payout_usd.value).toBe(5)
    expect(result.summary.guide_payout_usd.formula).toBe('MAX(R85,0)')
    // R87 uses operational R85 — higher payout lowers company profit vs negative-share path
    expect(result.summary.company_profit_usd.value).toBe(
      result.summary.company_gross_usd.value - result.summary.guide_settlement_usd.value,
    )
  })

  it('passes through guide payout when R85 is non-negative', () => {
    const result = calcSettlement(
      emptyInput({
        header: {
          ...emptyInput().header,
          megugi_usd: 2,
          settlement_ratio: 0.5,
          guide_daily_fee_usd: 15,
        },
        shoppings: [{ sale_usd: 50, com_usd: 20, kb_usd: 5 }],
        options: [{ unit_price_usd: 10, pax: 5, expense_usd: 5, expense_vnd: 0 }],
      }),
    )

    expect(result.summary.guide_settlement_usd.value).toBeGreaterThan(0)
    expect(result.summary.guide_payout_usd.value).toBe(result.summary.guide_settlement_usd.value)
  })
})

describe('calcGuideSettlementFromProfitPool', () => {
  it('deducts megugi from shopping COM + option COM then applies 50% share and daily fee', () => {
    const result = calcGuideSettlementFromProfitPool(20, 45, 2, 15)
    expect(result.actualProfitPool).toBe(63)
    expect(result.guideProfitShare).toBe(31.5)
    expect(result.guideSettlement).toBe(46.5)
    expect(result.guidePayout).toBe(46.5)
  })

  it('floors guide profit share at zero when megugi exceeds profit pool', () => {
    const result = calcGuideSettlementFromProfitPool(30, 45, 200, 5)
    expect(result.actualProfitPool).toBe(-125)
    expect(result.guideProfitShare).toBe(0)
    expect(result.guideSettlement).toBe(5)
    expect(result.guidePayout).toBe(5)
  })

  it('case A — pool negative: share=0, daily fee paid', () => {
    const result = calcGuideSettlementFromProfitPool(60, 40, 300, 50)
    expect(result.actualProfitPool).toBe(-200)
    expect(result.guideProfitShare).toBe(0)
    expect(result.guideSettlement).toBe(50)
    expect(result.guidePayout).toBe(50)
  })

  it('case B — pool positive: 50% share plus daily fee', () => {
    const result = calcGuideSettlementFromProfitPool(300, 200, 100, 50)
    expect(result.actualProfitPool).toBe(400)
    expect(result.guideProfitShare).toBe(200)
    expect(result.guideSettlement).toBe(250)
    expect(result.guidePayout).toBe(250)
  })

  it('floors final payout at zero when settlement is negative', () => {
    const result = calcGuideSettlementFromProfitPool(10, 10, 300, -5)
    expect(result.guideProfitShare).toBe(0)
    expect(result.guideSettlement).toBe(-5)
    expect(result.guidePayout).toBe(0)
  })
})

describe('guide settlement policy — calcSettlement integration', () => {
  it('case A: R85/P85 match policy when megugi exceeds profit', () => {
    const result = calcSettlement(policyTestInput(60, 40, 300, 50))
    const policy = calcGuideSettlementFromProfitPool(60, 40, 300, 50)

    expect(policy.actualProfitPool).toBe(-200)
    expect(policy.guideProfitShare).toBe(0)
    expect(policy.guideSettlement).toBe(50)
    expect(policy.guidePayout).toBe(50)

    expect(result.summary.guide_settlement_usd.excelRef).toBe('R85')
    expect(result.summary.guide_settlement_usd.value).toBe(50)
    expect(result.summary.guide_payout_usd.excelRef).toBe('P85')
    expect(result.summary.guide_payout_usd.value).toBe(50)
    expect(result.matrix.find((r) => r.key === 'r85')?.settlement?.value).toBe(50)
  })

  it('case B: R85/P85 match policy when profit remains after megugi', () => {
    const result = calcSettlement(policyTestInput(300, 200, 100, 50))
    const policy = calcGuideSettlementFromProfitPool(300, 200, 100, 50)

    expect(policy.actualProfitPool).toBe(400)
    expect(policy.guideProfitShare).toBe(200)
    expect(policy.guideSettlement).toBe(250)
    expect(policy.guidePayout).toBe(250)

    expect(result.summary.guide_settlement_usd.value).toBe(250)
    expect(result.summary.guide_payout_usd.value).toBe(250)
    expect(result.matrix.find((r) => r.key === 'r85')?.settlement?.value).toBe(250)
  })

  it('deducts megugi from F72+D81 before profit share', () => {
    const withoutMegugi = calcGuideSettlementFromProfitPool(300, 200, 0, 50)
    const withMegugi = calcGuideSettlementFromProfitPool(300, 200, 100, 50)

    expect(withoutMegugi.actualProfitPool - withMegugi.actualProfitPool).toBe(100)
    expect(withoutMegugi.guideProfitShare - withMegugi.guideProfitShare).toBe(50)
  })

  it('does not change Q75 when megugi or guide settlement changes', () => {
    const lowMegugi = calcSettlement(policyTestInput(300, 200, 0, 50))
    const highMegugi = calcSettlement(policyTestInput(300, 200, 300, 50))

    expect(highMegugi.sections.cash.company_deposit_usd.value).toBe(
      lowMegugi.sections.cash.company_deposit_usd.value,
    )
    expect(highMegugi.sections.cash.company_deposit_usd.formula).toBe('J75−N75−P75')
  })
})

describe('guide payout — production regression', () => {
  it('case 1: shopping COM 5500 + option 281.54 → ≈2890.77', () => {
    const result = calcSettlement(screenLikeInput(15500, 5500, 281.54, 0, 0))
    expect(result.sections.shopping.sale_usd.value).toBe(15500)
    expect(result.sections.shopping.com_usd.value).toBe(5500)
    expect(result.matrix.find((r) => r.key === 'r80')?.income?.value).toBe(5500)
    expect(result.summary.guide_payout_usd.value).toBeCloseTo(2890.77, 2)
  })

  it('case 1b: large SALE must not inflate D80 or R79', () => {
    const result = calcSettlement(screenLikeInput(15500, 5500, 281.54, 0, 0))
    expect(result.matrix.find((r) => r.key === 'r80')?.income?.value).toBe(5500)
    expect(result.matrix.find((r) => r.key === 'r79')?.settlement?.value).toBeCloseTo(5781.54, 2)
  })

  it('case 2: megugi 1000 reduces payout to 2390.77', () => {
    const result = calcSettlement(screenLikeInput(9460, 5500, 281.54, 1000, 0))
    expect(result.summary.guide_payout_usd.value).toBeCloseTo(2390.77, 2)
  })

  it('case 3: negative pool floors share; daily fee still paid', () => {
    const result = calcSettlement(screenLikeInput(0, 100, 0, 300, 50))
    expect(result.summary.guide_payout_usd.value).toBe(50)
  })

  it('does not double-count shopping SALE in guide payout (D80 vs F72)', () => {
    const withSale = calcSettlement(screenLikeInput(9460, 5500, 281.54, 0, 0))
    const comOnly = calcSettlement(screenLikeInput(0, 5500, 281.54, 0, 0))
    expect(withSale.summary.guide_payout_usd.value).toBe(comOnly.summary.guide_payout_usd.value)
    expect(withSale.summary.guide_payout_usd.value).not.toBeCloseTo(7620.77, 0)
  })
})

describe('Excel matrix helpers', () => {
  it('D80 operational = COM only; legacy helper still sums SALE+COM', () => {
    expect(calcShoppingIncomeD80(200, 60)).toBe(260)
    expect(calcShoppingActualProfitUsd(60)).toBe(60)
  })

  it('H85 = H84+J84+M84+O84 with operational M84=0', () => {
    expect(calcExpenseTotalH85(400, 308, 38)).toBe(746)
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

    expect(result.summary.income_total_usd.value).toBe(495)
    expect(result.summary.balance_usd.value).toBe(277)
    expect(result.summary.guide_settlement_usd.value).toBe(168.5)
    expect(result.summary.company_grand_total_usd.value).toBeCloseTo(-438.884615384, 4)

    const excelCheck = verifySettlementAgainstExcel(result, MOCK_SETTLEMENT_INPUT)
    expect(excelCheck.acceptable).toBe(true)
    expect(excelCheck.finals.every((f) => f.withinTolerance)).toBe(true)

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
