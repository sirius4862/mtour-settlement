import { describe, expect, it } from 'vitest'
import {
  ADMIN_STRICT_HEADER_KEYS,
  canAdminEditCompanyReviewFields,
  canEditHeaderField,
  canGuideEditCompanyReviewFields,
  COMPANY_REVIEW_HEADER_KEYS,
  mergeGuideHeaderForSave,
  pickAdminHeaderFields,
} from './field-ownership'
import { buildSnapshotPayload, diffSnapshotPayloads } from './snapshot'
import { sanitizeAdminDraftPayload, stateFromSettlementFull, toDraftPayload } from './mappers'
import type { SettlementFull } from '@/types'

describe('company review header fields (megugi / guide daily fee)', () => {
  it('allows guide to edit megugi and guide_daily_fee in the form', () => {
    expect(canEditHeaderField('guide', 'megugi_usd')).toBe(true)
    expect(canEditHeaderField('guide', 'guide_daily_fee_usd')).toBe(true)
  })

  it('blocks guide from strict admin-only header fields', () => {
    for (const key of ADMIN_STRICT_HEADER_KEYS) {
      expect(canEditHeaderField('guide', key)).toBe(false)
    }
  })

  it('allows guide edit only in draft / rejected / edit_requested', () => {
    expect(canGuideEditCompanyReviewFields('draft')).toBe(true)
    expect(canGuideEditCompanyReviewFields('rejected')).toBe(true)
    expect(canGuideEditCompanyReviewFields('edit_requested')).toBe(true)
    expect(canGuideEditCompanyReviewFields('submitted')).toBe(false)
    expect(canGuideEditCompanyReviewFields('approved')).toBe(false)
  })

  it('allows admin edit only in submitted / clarification_requested', () => {
    expect(canAdminEditCompanyReviewFields('submitted')).toBe(true)
    expect(canAdminEditCompanyReviewFields('clarification_requested')).toBe(true)
    expect(canAdminEditCompanyReviewFields('draft')).toBe(false)
    expect(canAdminEditCompanyReviewFields('pending_guide_confirmation')).toBe(false)
  })

  it('persists guide megugi / guide_daily_fee on guide save', () => {
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
        tc_company_usd: 8,
        megugi_usd: 12,
        guide_daily_fee_usd: 18,
        settlement_ratio: 0.9,
        guide_note: null,
      },
      pickAdminHeaderFields({
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
    expect(merged.megugi_usd).toBe(12)
    expect(merged.guide_daily_fee_usd).toBe(18)
  })

  it('includes admin megugi changes in confirm diff', () => {
    const existing: SettlementFull = {
      id: 's1',
      tour_id: 't1',
      guide_id: 'g1',
      branch_id: 'b1',
      status: 'submitted',
      year_month: '2025-11',
      exchange_rate: 26000,
      advance_vnd: 0,
      tour_fee_usd: 500,
      charming_other_usd: 0,
      tip_received_usd: 0,
      option_credit_usd: 0,
      vehicle_fee_usd: 0,
      head_tax_usd: 0,
      seoul_biz_fee_usd: 0,
      tc_guide_usd: 0,
      tc_company_usd: 0,
      megugi_usd: 5,
      guide_daily_fee_usd: 10,
      settlement_ratio: 0.5,
      guide_note: null,
      admin_note: null,
      reject_reason: null,
      submitted_at: null,
      reviewed_at: null,
      paid_at: null,
      edit_requested_at: null,
      reviewed_by: null,
      edit_requested_by: null,
      sent_for_confirmation_at: null,
      sent_for_confirmation_by: null,
      guide_confirmed_at: null,
      guide_confirmed_by: null,
      clarification_requested_at: null,
      clarification_message: null,
      active_confirmation_id: null,
      guide_submit_snapshot_id: null,
      created_at: '',
      updated_at: '',
      tour: {
        id: 't1',
        tour_code: 'T',
        pattern: 'P',
        agency_name: 'A',
        start_date: '2025-11-01',
        end_date: '2025-11-04',
        nights: 3,
        pax_count: 18,
        vehicle_type: '29',
        guide_id: 'g1',
        tc_name: null,
        branch_id: 'b1',
        created_by: 'a',
        created_at: '',
        updated_at: '',
      },
      hotels: [],
      meals: [],
      entrances: [],
      others: [],
      shoppings: [],
      options: [],
      receipts: [],
    }

    const before = buildSnapshotPayload(existing)
    const state = stateFromSettlementFull(existing, 'Guide')
    state.header.megugi_usd = 20
    state.header.guide_daily_fee_usd = 25
    const sanitized = sanitizeAdminDraftPayload(toDraftPayload(state), existing)
    const afterFull: SettlementFull = {
      ...existing,
      megugi_usd: sanitized.header.megugi_usd,
      guide_daily_fee_usd: sanitized.header.guide_daily_fee_usd,
    }
    const after = buildSnapshotPayload(afterFull)

    const changes = diffSnapshotPayloads(before, after)
    expect(changes.some((c) => c.field_path === 'header.megugi_usd')).toBe(true)
    expect(changes.some((c) => c.field_path === 'header.guide_daily_fee_usd')).toBe(true)
    for (const key of COMPANY_REVIEW_HEADER_KEYS) {
      const change = changes.find((c) => c.field_path === `header.${key}`)
      expect(change?.owner).toBe('guide')
    }
  })
})
