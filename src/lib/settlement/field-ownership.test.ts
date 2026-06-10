import { describe, expect, it } from 'vitest'
import { emptyHotelRow, emptyOptionRow } from './defaults'
import {
  ADMIN_STRICT_HEADER_KEYS,
  canEditHeaderField,
  canEditHotelUnitPrices,
  COMPANY_REVIEW_HEADER_KEYS,
  hasMeaningfulAdminHotelCompanyData,
  hasMeaningfulAdminHotelRow,
  mergeAdminHeaderForSave,
  mergeAdminHotelRowsForSave,
  mergeGuideHeaderForSave,
  mergeGuideHotelRowsForSave,
  mergeGuideOptionRowsForSave,
  pickAdminHeaderFields,
} from './field-ownership'

describe('canEditHeaderField', () => {
  it('blocks guide from strict admin header fields including ground_fee', () => {
    for (const key of ADMIN_STRICT_HEADER_KEYS) {
      expect(canEditHeaderField('guide', key)).toBe(false)
    }
    expect(canEditHeaderField('guide', 'ground_fee_usd')).toBe(false)
  })

  it('allows guide to edit company review fields', () => {
    for (const key of COMPANY_REVIEW_HEADER_KEYS) {
      expect(canEditHeaderField('guide', key)).toBe(true)
    }
  })

  it('allows admin to edit all header fields', () => {
    expect(canEditHeaderField('admin', 'vehicle_fee_usd')).toBe(true)
    expect(canEditHeaderField('admin', 'ground_fee_usd')).toBe(true)
    expect(canEditHeaderField('admin', 'megugi_usd')).toBe(true)
  })
})

describe('mergeGuideHeaderForSave', () => {
  it('preserves strict admin-owned values from existing row', () => {
    const merged = mergeGuideHeaderForSave(
      {
        advance_vnd: 1,
        charming_other_usd: 2,
        tip_received_usd: 3,
        option_receivable_usd: 3,
        tip_transfer_usd: 1,
        ground_fee_usd: 99,
        vehicle_fee_usd: 99,
        head_tax_usd: 99,
        seoul_biz_fee_usd: 99,
        tc_guide_usd: 5,
        tc_company_usd: 99,
        megugi_usd: 12,
        guide_daily_fee_usd: 18,
        settlement_ratio: 0.9,
        guide_note: null,
      },
      pickAdminHeaderFields({
        ground_fee_usd: 50,
        vehicle_fee_usd: 25,
        head_tax_usd: 8,
        seoul_biz_fee_usd: 5,
        tc_company_usd: 8,
        megugi_usd: 3,
        guide_daily_fee_usd: 20,
        settlement_ratio: 0.5,
      }),
    )
    expect(merged.vehicle_fee_usd).toBe(25)
    expect(merged.ground_fee_usd).toBe(50)
    expect(merged.settlement_ratio).toBe(0.5)
    expect(merged.megugi_usd).toBe(12)
    expect(merged.guide_daily_fee_usd).toBe(18)
  })
})

describe('mergeAdminHeaderForSave', () => {
  it('applies admin fields including ground_fee from incoming', () => {
    const merged = mergeAdminHeaderForSave(
      {
        advance_vnd: 1,
        charming_other_usd: 2,
        tip_received_usd: 3,
        option_receivable_usd: 3,
        tip_transfer_usd: 1,
        ground_fee_usd: 200,
        vehicle_fee_usd: 30,
        head_tax_usd: 10,
        seoul_biz_fee_usd: 5,
        tc_guide_usd: 5,
        tc_company_usd: 8,
        megugi_usd: 12,
        guide_daily_fee_usd: 20,
        settlement_ratio: 0.6,
        guide_note: null,
      },
      {
        advance_vnd: 100,
        charming_other_usd: 2,
        tip_received_usd: 3,
        option_receivable_usd: 3,
        tip_transfer_usd: 1,
        ground_fee_usd: 500,
        vehicle_fee_usd: 10,
        head_tax_usd: 5,
        seoul_biz_fee_usd: 3,
        tc_guide_usd: 5,
        tc_company_usd: 8,
        megugi_usd: 2,
        guide_daily_fee_usd: 15,
        settlement_ratio: 0.5,
        guide_note: 'note',
      },
    )
    expect(merged.ground_fee_usd).toBe(200)
    expect(merged.megugi_usd).toBe(12)
    expect(merged.settlement_ratio).toBe(0.6)
  })
})

describe('mergeAdminHotelRowsForSave', () => {
  const guideHotel = {
    ...emptyHotelRow(),
    id: 'hotel-1',
    clientId: 'client-1',
    hotel_name: 'Hotel A',
    nights: 2,
    sgl_count: 1,
    unit_price_sgl_usd: 50,
    unit_price_trp_usd: 40,
    guide_amount_usd: 80,
  }

  it('persists admin-added hotel row with full operational and company fields', () => {
    const incoming = [{
      ...emptyHotelRow(),
      clientId: 'admin-new',
      hotel_name: 'Da Nang Plaza',
      check_in_date: '2025-11-02',
      nights: 3,
      sgl_count: 2,
      twn_count: 1,
      trp_count: 0,
      guide_amount_usd: 999,
      unit_price_sgl_usd: 55,
      unit_price_trp_usd: 45,
    }]

    const merged = mergeAdminHotelRowsForSave(incoming, [])

    expect(merged).toHaveLength(1)
    expect(merged[0].hotel_name).toBe('Da Nang Plaza')
    expect(merged[0].check_in_date).toBe('2025-11-02')
    expect(merged[0].nights).toBe(3)
    expect(merged[0].sgl_count).toBe(2)
    expect(merged[0].twn_count).toBe(1)
    expect(merged[0].trp_count).toBe(0)
    expect(merged[0].unit_price_sgl_usd).toBe(55)
    expect(merged[0].unit_price_trp_usd).toBe(45)
    expect(merged[0].guide_amount_usd).toBe(0)
  })

  it('accepts admin-added rows with operational data before unit prices are set', () => {
    const incoming = [{
      ...emptyHotelRow(),
      clientId: 'admin-new',
      hotel_name: 'Pending rates',
      nights: 2,
      sgl_count: 1,
    }]

    const merged = mergeAdminHotelRowsForSave(incoming, [])

    expect(merged).toHaveLength(1)
    expect(hasMeaningfulAdminHotelRow(merged[0])).toBe(true)
    expect(merged[0].hotel_name).toBe('Pending rates')
  })

  it('preserves existing guide hotel fields while applying admin operational edits', () => {
    const incoming = [{
      ...guideHotel,
      hotel_name: 'Updated by admin',
      nights: 4,
      sgl_count: 2,
      guide_amount_usd: 999,
      unit_price_sgl_usd: 75,
      unit_price_trp_usd: 60,
    }]

    const merged = mergeAdminHotelRowsForSave(incoming, [guideHotel])

    expect(merged).toHaveLength(1)
    expect(merged[0].hotel_name).toBe('Updated by admin')
    expect(merged[0].nights).toBe(4)
    expect(merged[0].sgl_count).toBe(2)
    expect(merged[0].guide_amount_usd).toBe(80)
    expect(merged[0].unit_price_sgl_usd).toBe(75)
    expect(merged[0].unit_price_trp_usd).toBe(60)
  })

  it('drops admin-added rows without meaningful company unit prices', () => {
    const incoming = [{ ...emptyHotelRow(), clientId: 'empty-admin' }]

    expect(mergeAdminHotelRowsForSave(incoming, [])).toHaveLength(0)
  })
})

describe('mergeGuideHotelRowsForSave', () => {
  it('preserves admin-owned unit prices when guide saves', () => {
    const existing = [{
      ...emptyHotelRow(),
      id: 'hotel-1',
      clientId: 'client-1',
      unit_price_sgl_usd: 50,
      unit_price_trp_usd: 40,
      guide_amount_usd: 10,
    }]
    const incoming = [{
      ...existing[0],
      unit_price_sgl_usd: 999,
      unit_price_trp_usd: 888,
      guide_amount_usd: 80,
    }]

    const merged = mergeGuideHotelRowsForSave(incoming, existing)

    expect(merged[0].unit_price_sgl_usd).toBe(50)
    expect(merged[0].unit_price_trp_usd).toBe(40)
    expect(merged[0].guide_amount_usd).toBe(80)
  })
})

describe('canEditHotelUnitPrices', () => {
  it('allows admin only', () => {
    expect(canEditHotelUnitPrices('admin')).toBe(true)
    expect(canEditHotelUnitPrices('guide')).toBe(false)
    expect(canEditHotelUnitPrices('readOnly')).toBe(false)
  })
})

describe('mergeGuideOptionRowsForSave', () => {
  it('keeps guide option rows and preserves admin extra-vehicle rows from DB', () => {
    const incoming = [
      {
        ...emptyOptionRow(false),
        clientId: 'opt-1',
        option_name: '보트투어',
        unit_price_usd: 25,
        pax: 8,
      },
    ]
    const existing = [
      {
        ...emptyOptionRow(true),
        id: 'extra-1',
        clientId: 'extra-1',
        expense_usd: 35,
        expense_vnd: 780000,
      },
    ]

    const merged = mergeGuideOptionRowsForSave(incoming, existing)

    expect(merged.filter((r) => r.is_extra_vehicle !== true)).toHaveLength(1)
    expect(merged.filter((r) => r.is_extra_vehicle === true)).toHaveLength(1)
    expect(merged[0]?.option_name).toBe('보트투어')
  })
})
