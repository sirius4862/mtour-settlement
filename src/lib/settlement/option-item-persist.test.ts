import { describe, expect, it, vi } from 'vitest'
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
  buildGuideOptionDeleteIds,
  stripAllLineItemIdsForCreate,
  stripOrphanLineItemIdsFromPayload,
  collectKnownLineItemIds,
  existingLineItemRowsById,
} from './line-item-persist-prep'
import { filterRowsNeedingUpdate, persistGuideLineItemTable } from './guide-line-item-persist'

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

  it('preserves existing guide options when incoming payload is empty', () => {
    const existing = existingSettlementWithOptions()
    const sanitized = sanitizeGuideDraftPayload(
      { ...toDraftPayload(draftStateWithOptions(SETTLEMENT_ID)), options: [] },
      existing,
    )

    expect(sanitized.options.filter((r) => r.is_extra_vehicle !== true)).toHaveLength(1)
    expect(sanitized.options[0]?.option_name).toBe('보트투어')
    expect(sanitized.options[0]?.id).toBe('opt-db-1')
  })

  it('treats only is_extra_vehicle === true as extra vehicle on save rows', () => {
    const rows = buildOptionDbRows(
      [
        guideOptionRow({ is_extra_vehicle: false }),
        guideOptionRow({ is_extra_vehicle: null as unknown as undefined }),
        guideOptionRow({ is_extra_vehicle: undefined }),
      ],
      SETTLEMENT_ID,
      26000,
    )

    expect(rows.every((r) => r.is_extra_vehicle === false)).toBe(true)
    expect(rows).toHaveLength(3)
  })

  it('admin review hydrate sees guide option rows after guide save round-trip', () => {
    const existing = existingSettlementWithOptions()
    const hydrated = stateFromSettlementFull(existing, '가이드')
    const payload = toDraftPayload({
      ...hydrated,
      options: [],
    })
    const sanitized = sanitizeGuideDraftPayload(payload, existing)
    const adminView = stateFromSettlementFull(
      { ...existing, options: buildOptionDbRows(sanitized.options, SETTLEMENT_ID, sanitized.exchange_rate) as SettlementFull['options'] },
      'Admin',
    )

    expect(adminView.options.filter((r) => r.is_extra_vehicle !== true)).toHaveLength(1)
    expect(adminView.options[0]?.option_name).toBe('보트투어')
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

describe('option item persist — unchanged update skipping', () => {
  it('no-change resave skips all option row updates (requestCount = 0)', async () => {
    const existing = existingSettlementWithOptions('opt-db-1')
    const hydrated = stateFromSettlementFull(existing, '가이드')
    const payload = stripOrphanLineItemIdsFromPayload(
      sanitizeGuideDraftPayload(toDraftPayload(hydrated), existing),
      collectKnownLineItemIds(existing),
    )
    const rows = buildOptionDbRows(payload.options, SETTLEMENT_ID, payload.exchange_rate)
    const existingById = existingLineItemRowsById(existing.options)

    const { rows: needingUpdate, skipped } = filterRowsNeedingUpdate(
      rows,
      existingById,
      'option_items',
    )
    expect(skipped).toBe(1)
    expect(needingUpdate).toHaveLength(0)

    const update = vi.fn()
    const supabase = {
      from: vi.fn(() => ({
        delete: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update,
      })),
    }

    const result = await persistGuideLineItemTable(
      supabase as never,
      'option_items',
      SETTLEMENT_ID,
      rows,
      [],
      existingById,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.requestCount).toBe(0)
      expect(result.updatesSkipped).toBe(1)
    }
    expect(update).not.toHaveBeenCalled()
  })

  it('changed option_name triggers exactly one update', async () => {
    const existing = existingSettlementWithOptions('opt-db-1')
    const hydrated = stateFromSettlementFull(existing, '가이드')
    hydrated.options[0] = { ...hydrated.options[0]!, option_name: '변경된 옵션' }
    const payload = stripOrphanLineItemIdsFromPayload(
      sanitizeGuideDraftPayload(toDraftPayload(hydrated), existing),
      collectKnownLineItemIds(existing),
    )
    const rows = buildOptionDbRows(payload.options, SETTLEMENT_ID, payload.exchange_rate)
    const existingById = existingLineItemRowsById(existing.options)

    const { rows: needingUpdate } = filterRowsNeedingUpdate(rows, existingById, 'option_items')
    expect(needingUpdate).toHaveLength(1)

    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })
    const supabase = {
      from: vi.fn(() => ({
        delete: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update,
      })),
    }

    const result = await persistGuideLineItemTable(
      supabase as never,
      'option_items',
      SETTLEMENT_ID,
      rows,
      [],
      existingById,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.requestCount).toBe(1)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('repeated no-change save does not insert duplicate option rows', async () => {
    const tables = new Map<string, Record<string, unknown>[]>()
    const existing = existingSettlementWithOptions('opt-db-1')
    tables.set('option_items', [...existing.options] as unknown as Record<string, unknown>[])

    const supabase = {
      from(table: string) {
        const getRows = () => tables.get(table) ?? []
        const setRows = (rows: Record<string, unknown>[]) => tables.set(table, rows)
        return {
          delete: () => ({
            in: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
          insert: async (rows: Record<string, unknown>[]) => {
            setRows([...getRows(), ...rows])
            return { error: null }
          },
          update: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        }
      },
    }

    const runSave = async () => {
      const hydrated = stateFromSettlementFull(existing, '가이드')
      const payload = stripOrphanLineItemIdsFromPayload(
        sanitizeGuideDraftPayload(toDraftPayload(hydrated), existing),
        collectKnownLineItemIds(existing),
      )
      const rows = buildOptionDbRows(payload.options, SETTLEMENT_ID, payload.exchange_rate)
      return persistGuideLineItemTable(
        supabase as never,
        'option_items',
        SETTLEMENT_ID,
        rows,
        [],
        existingLineItemRowsById(existing.options),
      )
    }

    const first = await runSave()
    const second = await runSave()
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (first.ok) expect(first.requestCount).toBe(0)
    if (second.ok) expect(second.requestCount).toBe(0)
    expect(tables.get('option_items')).toHaveLength(1)
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

describe('option item persist — P0 failed-save retry regression', () => {
  it('omitted options preserves existing guide rows via sanitize merge', () => {
    const existing = existingSettlementWithOptions()
    const sanitized = sanitizeGuideDraftPayload(
      { ...toDraftPayload(draftStateWithOptions(SETTLEMENT_ID)), options: undefined as unknown as [] },
      existing,
    )
    expect(sanitized.options.filter((r) => r.is_extra_vehicle !== true)).toHaveLength(1)
  })

  it('options: [] retry preserves existing guide rows after sanitize', () => {
    const existing = existingSettlementWithOptions()
    const sanitized = sanitizeGuideDraftPayload(
      { ...toDraftPayload(draftStateWithOptions(SETTLEMENT_ID)), options: [] },
      existing,
    )
    expect(sanitized.options[0]?.id).toBe('opt-db-1')
    expect(buildGuideOptionDeleteIds(sanitized.options, existing.options)).toEqual([])
  })

  it('is_extra_vehicle=false survives save/reload round-trip', () => {
    const hydrated = stateFromSettlementFull(existingSettlementWithOptions(), '가이드')
    expect(hydrated.options[0]?.is_extra_vehicle).toBe(false)
    const rows = buildOptionDbRows(
      sanitizeGuideDraftPayload(toDraftPayload(hydrated), existingSettlementWithOptions()).options,
      SETTLEMENT_ID,
      26000,
    )
    expect(rows[0]?.is_extra_vehicle).toBe(false)
  })

  it('is_extra_vehicle=true extra rows survive guide save merge', () => {
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
    const sanitized = sanitizeGuideDraftPayload(
      { ...toDraftPayload(draftStateWithOptions(SETTLEMENT_ID)), options: [] },
      existing,
    )
    expect(sanitized.options.some((r) => r.is_extra_vehicle === true)).toBe(true)
  })

  it('failed-save retry with stripped orphan ids does not plan guide option deletes', () => {
    const existing = existingSettlementWithOptions()
    const payload = sanitizeGuideDraftPayload(
      stripOrphanLineItemIdsFromPayload(
        {
          ...toDraftPayload(draftStateWithOptions(SETTLEMENT_ID)),
          options: [
            {
              ...guideOptionRow(),
              id: 'stale-not-in-db',
              clientId: 'stale-client',
            },
          ],
        },
        collectKnownLineItemIds(existing),
      ),
      existing,
    )
    expect(buildGuideOptionDeleteIds(payload.options, existing.options)).toEqual([])
    expect(payload.options.filter((r) => r.is_extra_vehicle !== true)).toHaveLength(1)
    expect(payload.options[0]?.id).toBe('opt-db-1')
  })

  it('new guide option row persists after save payload round-trip', () => {
    const state = draftStateWithOptions(SETTLEMENT_ID)
    state.options = [
      { ...guideOptionRow(), id: 'opt-db-1' },
      guideOptionRow({ clientId: 'new-opt', option_name: '신규 옵션' }),
    ]
    const sanitized = sanitizeGuideDraftPayload(toDraftPayload(state), existingSettlementWithOptions())
    const rows = buildOptionDbRows(sanitized.options, SETTLEMENT_ID, sanitized.exchange_rate)
    expect(rows.filter((r) => r.is_extra_vehicle === false)).toHaveLength(2)
    expect(rows.some((r) => r.option_name === '신규 옵션')).toBe(true)
  })

  it('explicit soft-delete removes guide option rows when marked deleted', () => {
    const existing = existingSettlementWithOptions()
    const sanitized = sanitizeGuideDraftPayload(
      {
        ...toDraftPayload(draftStateWithOptions(SETTLEMENT_ID)),
        options: [{ ...guideOptionRow(), id: 'opt-db-1', deleted: true }],
      },
      existing,
    )
    expect(buildGuideOptionDeleteIds(sanitized.options, existing.options)).toEqual(['opt-db-1'])
  })
})
