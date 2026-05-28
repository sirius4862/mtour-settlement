import { describe, expect, it } from 'vitest'
import {
  ADMIN_STRICT_HEADER_KEYS,
  canEditHeaderField,
  COMPANY_REVIEW_HEADER_KEYS,
  mergeAdminHeaderForSave,
  mergeGuideHeaderForSave,
  pickAdminHeaderFields,
} from './field-ownership'

describe('canEditHeaderField', () => {
  it('blocks guide from strict admin header fields', () => {
    for (const key of ADMIN_STRICT_HEADER_KEYS) {
      expect(canEditHeaderField('guide', key)).toBe(false)
    }
    expect(canEditHeaderField('guide', 'tour_fee_usd')).toBe(false)
  })

  it('allows guide to edit company review fields', () => {
    for (const key of COMPANY_REVIEW_HEADER_KEYS) {
      expect(canEditHeaderField('guide', key)).toBe(true)
    }
  })

  it('allows admin to edit all header fields', () => {
    expect(canEditHeaderField('admin', 'vehicle_fee_usd')).toBe(true)
    expect(canEditHeaderField('admin', 'megugi_usd')).toBe(true)
    expect(canEditHeaderField('admin', 'tour_fee_usd')).toBe(true)
  })
})

describe('mergeGuideHeaderForSave', () => {
  it('preserves strict admin-owned values from existing row', () => {
    const merged = mergeGuideHeaderForSave(
      {
        advance_vnd: 1,
        charming_other_usd: 2,
        tip_received_usd: 3,
        option_credit_usd: 4,
        tour_fee_usd: 120,
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
        tour_fee_usd: 75,
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
    expect(merged.tour_fee_usd).toBe(75)
    expect(merged.settlement_ratio).toBe(0.5)
    expect(merged.megugi_usd).toBe(12)
    expect(merged.guide_daily_fee_usd).toBe(18)
  })
})

describe('mergeAdminHeaderForSave', () => {
  it('applies admin fields including tour_fee from incoming', () => {
    const merged = mergeAdminHeaderForSave(
      {
        advance_vnd: 1,
        charming_other_usd: 2,
        tip_received_usd: 3,
        option_credit_usd: 4,
        tour_fee_usd: 999,
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
        option_credit_usd: 4,
        tour_fee_usd: 500,
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
    expect(merged.tour_fee_usd).toBe(999)
    expect(merged.megugi_usd).toBe(12)
    expect(merged.settlement_ratio).toBe(0.6)
  })
})
