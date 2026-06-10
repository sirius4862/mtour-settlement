import { describe, expect, it } from 'vitest'
import type { SettlementFull, Tour } from '@/types'
import type { SettlementFormState } from './form-types'
import { emptyOptionRow } from './defaults'
import { mergeGuideOptionRowsForSave } from './field-ownership'
import {
  buildMealDbRows,
  buildOptionDbRows,
  mergeServerSync,
  sanitizeGuideDraftPayload,
  stateFromSettlementFull,
  toDraftPayload,
  type SettlementDraftPayload,
} from './mappers'
import {
  stripAllLineItemIdsForCreate,
  stripOrphanLineItemIdsFromPayload,
  collectKnownLineItemIds,
} from './line-item-persist-prep'

const SETTLEMENT_ID = '11111111-1111-1111-1111-111111111111'
const TOUR_ID = '22222222-2222-2222-2222-222222222222'

function mockTour(): Tour {
  return {
    id: TOUR_ID,
    tour_code: 'APR26-01',
    pattern: '다낭',
    agency_name: 'QA',
    start_date: '2026-04-01',
    end_date: '2026-04-04',
    pax_count: 10,
    nights: 3,
    vehicle_type: '29인승',
    guide_id: 'guide-1',
    tc_name: null,
    branch_id: 'branch-1',
    assignment_status: 'assigned',
    recalled_at: null,
    recalled_by: null,
    created_by: 'admin-1',
    created_at: '',
    updated_at: '',
  }
}

function guideOptionRow(overrides: Partial<ReturnType<typeof emptyOptionRow>> = {}) {
  return {
    ...emptyOptionRow(false),
    option_name: '보트투어',
    unit_price_usd: 25,
    pax: 8,
    expense_usd: 10,
    expense_vnd: 0,
    ...overrides,
  }
}

function draftStateWithOptions(settlementId: string | null = null): SettlementFormState {
  return {
    settlementId,
    tourId: TOUR_ID,
    tour: mockTour(),
    guideName: '가이드',
    exchange_rate: 26000,
    header: {
      advance_vnd: 0,
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
      guide_note: null,
    },
    hotels: [],
    meals: [
      {
        clientId: 'meal-1',
        meal_date: null,
        restaurant_name: '식당',
        pax: 10,
        unit_price_vnd: 100000,
      },
    ],
    entrances: [],
    others: [],
    companyExpenses: [],
    shoppings: [],
    options: [guideOptionRow()],
    receipts: [],
    settlementStatus: 'draft' as const,
    guideSubmitSnapshotId: null,
    dirty: true,
    saveStatus: 'idle' as const,
    lastSavedAt: null,
    saveError: null,
  }
}

function existingSettlementWithOptions(optionId = 'opt-db-1'): SettlementFull {
  return {
    id: SETTLEMENT_ID,
    tour_id: TOUR_ID,
    guide_id: 'guide-1',
    branch_id: 'branch-1',
    status: 'draft',
    year_month: '2026-04',
    exchange_rate: 26000,
    advance_vnd: 0,
    tour_fee_usd: 0,
    ground_fee_usd: 0,
    charming_other_usd: 0,
    tip_received_usd: 0,
    option_receivable_usd: 0,
    tip_transfer_usd: 0,
    option_credit_usd: 0,
    vehicle_fee_usd: 0,
    head_tax_usd: 0,
    seoul_biz_fee_usd: 0,
    tc_guide_usd: 0,
    tc_company_usd: 0,
    megugi_usd: 0,
    guide_daily_fee_usd: 0,
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
    calc_summary_json: null,
    created_at: '',
    updated_at: '',
    tour: mockTour(),
    hotels: [],
    meals: [],
    entrances: [],
    others: [],
    shoppings: [],
    options: [
      {
        id: optionId,
        settlement_id: SETTLEMENT_ID,
        option_date: '2026-04-02',
        option_name: '보트투어',
        unit_price_usd: 25,
        pax: 8,
        total_sale_usd: 200,
        expense_usd: 10,
        expense_vnd: 0,
        com_usd: 190,
        is_extra_vehicle: false,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      },
    ],
    company_expenses: [],
    receipts: [],
  }
}

describe('option item persist — save payload', () => {
  it('includes guide option rows in a new draft payload', () => {
    const payload = toDraftPayload(draftStateWithOptions())

    expect(payload.options).toHaveLength(1)
    expect(payload.options[0]?.option_name).toBe('보트투어')
  })

  it('persists option rows on first create after stale-id stripping', () => {
    const state = draftStateWithOptions()
    state.options[0] = { ...state.options[0]!, id: 'stale-opt-id' }

    const payload = stripAllLineItemIdsForCreate(
      sanitizeGuideDraftPayload(toDraftPayload(state), null),
    )
    const rows = buildOptionDbRows(payload.options, SETTLEMENT_ID, payload.exchange_rate)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      settlement_id: SETTLEMENT_ID,
      option_name: '보트투어',
      is_extra_vehicle: false,
    })
    expect(rows[0]?.id).toBeUndefined()
  })

  it('keeps guide option rows on edit save while preserving admin extra-vehicle rows', () => {
    const existing = existingSettlementWithOptions()
    existing.options.push({
      id: 'opt-extra-1',
      settlement_id: SETTLEMENT_ID,
      option_date: null,
      option_name: '차량비(추가)',
      unit_price_usd: 0,
      pax: 0,
      total_sale_usd: 0,
      expense_usd: 35,
      expense_vnd: 780000,
      com_usd: 0,
      is_extra_vehicle: true,
      sort_order: 1,
      created_at: '',
      updated_at: '',
    })

    const incoming = toDraftPayload({
      ...draftStateWithOptions(SETTLEMENT_ID),
      options: [
        {
          ...guideOptionRow(),
          id: 'opt-db-1',
          option_name: '보트투어 수정',
          unit_price_usd: 30,
        },
      ],
    })

    const sanitized = sanitizeGuideDraftPayload(incoming, existing)
    const rows = buildOptionDbRows(sanitized.options, SETTLEMENT_ID, sanitized.exchange_rate)

    expect(sanitized.options.filter((r) => !r.is_extra_vehicle)).toHaveLength(1)
    expect(sanitized.options.filter((r) => r.is_extra_vehicle === true)).toHaveLength(1)
    expect(rows.filter((r) => r.is_extra_vehicle === false)).toHaveLength(1)
    expect(rows.find((r) => r.is_extra_vehicle === true)?.expense_usd).toBe(35)
  })

  it('does not drop guide options when is_extra_vehicle is undefined', () => {
    const row = guideOptionRow()
    delete row.is_extra_vehicle

    const merged = mergeGuideOptionRowsForSave([row], [])

    expect(merged).toHaveLength(1)
    expect(merged[0]?.option_name).toBe('보트투어')
  })

  it('still persists meals alongside options in the same draft payload', () => {
    const payload = toDraftPayload(draftStateWithOptions())
    const optionRows = buildOptionDbRows(payload.options, SETTLEMENT_ID, payload.exchange_rate)
    const mealRows = buildMealDbRows(payload.meals, SETTLEMENT_ID)

    expect(optionRows).toHaveLength(1)
    expect(mealRows).toHaveLength(1)
  })
})

describe('option item persist — hydration and resave', () => {
  it('hydrates saved option rows into edit form state', () => {
    const hydrated = stateFromSettlementFull(existingSettlementWithOptions(), '가이드')

    expect(hydrated.options).toHaveLength(1)
    expect(hydrated.options[0]).toMatchObject({
      id: 'opt-db-1',
      option_name: '보트투어',
      unit_price_usd: 25,
      pax: 8,
      is_extra_vehicle: false,
    })
  })

  it('round-trips hydrate → edit → sanitize → db rows for the same settlement', () => {
    const hydrated = stateFromSettlementFull(existingSettlementWithOptions(), '가이드')
    hydrated.options[0] = {
      ...hydrated.options[0]!,
      option_name: '보트투어(수정)',
      unit_price_usd: 30,
      pax: 9,
    }

    const payload = toDraftPayload(hydrated)
    const existing = existingSettlementWithOptions()
    const sanitized = stripOrphanLineItemIdsFromPayload(
      sanitizeGuideDraftPayload(payload, existing),
      collectKnownLineItemIds(existing),
    )
    const rows = buildOptionDbRows(sanitized.options, SETTLEMENT_ID, sanitized.exchange_rate)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'opt-db-1',
      option_name: '보트투어(수정)',
      unit_price_usd: 30,
      pax: 9,
      is_extra_vehicle: false,
    })
  })

  it('mergeServerSync replaces client option rows with server rows', () => {
    const existing = existingSettlementWithOptions()
    const state = stateFromSettlementFull(existing, '가이드')
    state.options.push(guideOptionRow({ clientId: 'opt-new', option_name: '신규 옵션' }))

    const merged = mergeServerSync(state, {
      status: 'draft',
      receipts: [],
      hotels: existing.hotels,
      meals: existing.meals,
      entrances: existing.entrances,
      others: existing.others,
      company_expenses: existing.company_expenses,
      shoppings: existing.shoppings,
      options: [
        existing.options[0]!,
        {
          id: 'opt-new-db',
          settlement_id: SETTLEMENT_ID,
          option_date: null,
          option_name: '신규 옵션',
          unit_price_usd: 25,
          pax: 8,
          total_sale_usd: 200,
          expense_usd: 10,
          expense_vnd: 0,
          com_usd: 190,
          is_extra_vehicle: false,
          sort_order: 1,
          created_at: '',
          updated_at: '',
        },
      ],
    })

    expect(merged.options?.filter((r) => !r.deleted && r.is_extra_vehicle !== true)).toHaveLength(2)
    expect(merged.options?.find((r) => r.option_name === '신규 옵션')?.id).toBe('opt-new-db')
    expect(merged.meals).toHaveLength(existing.meals.length)
  })
})

describe('option item persist — duplicate-create guard unaffected', () => {
  it('does not create a second settlement id while binding the same draft payload', () => {
    const payload: SettlementDraftPayload = {
      ...toDraftPayload(draftStateWithOptions()),
      settlementId: SETTLEMENT_ID,
    }

    expect(payload.settlementId).toBe(SETTLEMENT_ID)
    expect(payload.options).toHaveLength(1)
  })
})
