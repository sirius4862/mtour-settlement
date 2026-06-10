import { describe, expect, it } from 'vitest'

import type { SettlementFull, Tour } from '@/types'

import { emptyEntranceRow, emptyMealRow, emptyOptionRow, emptyOtherRow, emptyShoppingRow } from './defaults'

import type { SettlementFormState } from './form-types'

import { applyDraftSaveResult } from './draft-save-flow'

import {

  buildEntranceDbRows,

  buildMealDbRows,

  buildOptionDbRows,

  buildOtherDbRows,

  buildShoppingDbRows,

  mergeServerSync,

  sanitizeGuideDraftPayload,

  stateFromSettlementFull,

  toDraftPayload,

} from './mappers'

import {

  collectKnownLineItemIds,

  diagnoseDraftLineItemDuplicates,

  normalizeDraftLineItemPayload,

  stripAllLineItemIdsForCreate,

  stripOrphanLineItemIdsFromPayload,

} from './line-item-persist-prep'

import { persistGuideLineItemTable } from './guide-line-item-persist'



const SETTLEMENT_ID = '11111111-1111-1111-1111-111111111111'

const TOUR_ID = '22222222-2222-2222-2222-222222222222'

const EXCHANGE_RATE = 26000



type DbRow = Record<string, unknown> & { id: string; settlement_id: string }



function parseKeepIds(notInValue: string): string[] {

  return notInValue

    .replace(/^\(/, '')

    .replace(/\)$/, '')

    .split(',')

    .map((s) => s.trim().replace(/^"/, '').replace(/"$/, ''))

    .filter(Boolean)

}



function createInMemoryLineItemDb(initial: Record<string, DbRow[]> = {}) {

  const tables = new Map<string, DbRow[]>(Object.entries(initial))

  let nextId = 1



  function tableRows(table: string): DbRow[] {

    if (!tables.has(table)) tables.set(table, [])

    return tables.get(table)!

  }



  const supabase = {

    from(table: string) {

      return {

        delete(_opts?: { count?: string }) {

          let settlementId: string | undefined

          let rowId: string | undefined

          let keepIds: string[] | undefined



          const chain = {

            eq(col: string, val: string) {

              if (col === 'settlement_id') {

                settlementId = val

                if (rowId) return finalize()

                return chain

              }

              if (col === 'id') {

                rowId = val

                if (settlementId) return finalize()

                return chain

              }

              return chain

            },

            not(col: string, _op: string, val: string) {

              if (col === 'id') keepIds = parseKeepIds(val)

              return finalize()

            },

            then(onFulfilled?: (value: { error: null; count: number }) => unknown) {

              return finalize().then(onFulfilled)

            },

          }



          function finalize() {

            const rows = tableRows(table)

            const before = rows.length

            const kept = rows.filter((row) => {

              if (settlementId && row.settlement_id !== settlementId) return true

              if (rowId && row.id !== rowId) return true

              if (keepIds && keepIds.includes(row.id)) return true

              return false

            })

            tables.set(table, kept)

            return Promise.resolve({ error: null, count: before - kept.length })

          }



          return chain

        },

        insert(payload: Record<string, unknown>[]) {

          const rows = tableRows(table)

          for (const row of payload) {

            const id = `db-${table}-${nextId++}`

            rows.push({ ...row, id, settlement_id: row.settlement_id as string })

          }

          return Promise.resolve({ error: null })

        },

        update(patch: Record<string, unknown>) {

          return {

            eq(col: string, val: string) {

              return {

                eq(col2: string, val2: string) {

                  const rows = tableRows(table)

                  const idx = rows.findIndex(

                    (r) => r[col as keyof DbRow] === val && r[col2 as keyof DbRow] === val2,

                  )

                  if (idx >= 0) rows[idx] = { ...rows[idx]!, ...patch }

                  return Promise.resolve({ error: null })

                },

              }

            },

          }

        },

      }

    },

  }



  return {

    supabase,

    count(table: string, settlementId: string) {

      return tableRows(table).filter((r) => r.settlement_id === settlementId).length

    },

    rows(table: string, settlementId: string) {

      return tableRows(table).filter((r) => r.settlement_id === settlementId)

    },

  }

}



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



function oneRowPerSectionState(settlementId: string | null = null): SettlementFormState {

  return {

    settlementId,

    tourId: TOUR_ID,

    tour: mockTour(),

    guideName: '가이드',

    exchange_rate: EXCHANGE_RATE,

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

    meals: [{ ...emptyMealRow(), restaurant_name: '식당A', pax: 10, unit_price_vnd: 100000 }],

    entrances: [{ ...emptyEntranceRow(), attraction_name: '입장A', pax: 10, unit_price_vnd: 50000 }],

    others: [{ ...emptyOtherRow(), description: '기타A', amount_usd: 10, amount_vnd: 0 }],

    companyExpenses: [],

    shoppings: [{ ...emptyShoppingRow(), shop_name: '쇼핑A', sale_usd: 100, com_usd: 10 }],

    options: [{ ...emptyOptionRow(false), option_name: '보트투어', unit_price_usd: 25, pax: 8 }],

    receipts: [],

    settlementStatus: settlementId ? 'draft' : null,

    guideSubmitSnapshotId: null,

    dirty: true,

    saveStatus: 'idle',

    lastSavedAt: null,

    saveError: null,

  }

}



async function persistAllGuideSections(

  db: ReturnType<typeof createInMemoryLineItemDb>,

  settlementId: string,

  payload: ReturnType<typeof toDraftPayload>,

) {

  const sections = [

    { table: 'meal_items', rows: buildMealDbRows(payload.meals, settlementId) },

    { table: 'entrance_items', rows: buildEntranceDbRows(payload.entrances, settlementId) },

    { table: 'other_expense_items', rows: buildOtherDbRows(payload.others, settlementId) },

    { table: 'shopping_items', rows: buildShoppingDbRows(payload.shoppings, settlementId) },

    {

      table: 'option_items',

      rows: buildOptionDbRows(payload.options, settlementId, payload.exchange_rate),

    },

  ] as const



  for (const { table, rows } of sections) {

    const result = await persistGuideLineItemTable(db.supabase as never, table, settlementId, rows, [])

    expect(result.ok).toBe(true)

  }

}



function settlementFullFromDb(

  db: ReturnType<typeof createInMemoryLineItemDb>,

  state: SettlementFormState,

): SettlementFull {

  return {

    id: SETTLEMENT_ID,

    tour_id: TOUR_ID,

    guide_id: 'guide-1',

    branch_id: 'branch-1',

    status: 'draft',

    year_month: '2026-04',

    exchange_rate: EXCHANGE_RATE,

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

    meals: db.rows('meal_items', SETTLEMENT_ID) as unknown as SettlementFull['meals'],

    entrances: db.rows('entrance_items', SETTLEMENT_ID) as unknown as SettlementFull['entrances'],

    others: db.rows('other_expense_items', SETTLEMENT_ID) as unknown as SettlementFull['others'],

    shoppings: db.rows('shopping_items', SETTLEMENT_ID) as unknown as SettlementFull['shoppings'],

    options: db.rows('option_items', SETTLEMENT_ID) as unknown as SettlementFull['options'],

    company_expenses: [],

    receipts: [],

  }

}



function prepareCreatePayload(state: SettlementFormState) {

  return normalizeDraftLineItemPayload(

    stripAllLineItemIdsForCreate(sanitizeGuideDraftPayload(toDraftPayload(state), null)),

  )

}



function prepareEditPayload(state: SettlementFormState, existing: SettlementFull) {

  return normalizeDraftLineItemPayload(

    stripOrphanLineItemIdsFromPayload(

      sanitizeGuideDraftPayload(toDraftPayload(state), existing),

      collectKnownLineItemIds(existing),

    ),

  )

}



describe('child item save idempotency — server persist', () => {

  it('A: first create save persists exactly one row per child section', async () => {

    const db = createInMemoryLineItemDb()

    const payload = prepareCreatePayload(oneRowPerSectionState())



    await persistAllGuideSections(db, SETTLEMENT_ID, payload)



    expect(db.count('meal_items', SETTLEMENT_ID)).toBe(1)

    expect(db.count('entrance_items', SETTLEMENT_ID)).toBe(1)

    expect(db.count('other_expense_items', SETTLEMENT_ID)).toBe(1)

    expect(db.count('shopping_items', SETTLEMENT_ID)).toBe(1)

    expect(db.count('option_items', SETTLEMENT_ID)).toBe(1)

  })



  it('B: saving the same payload again without ids does not duplicate rows', async () => {

    const db = createInMemoryLineItemDb()

    const payload = prepareCreatePayload(oneRowPerSectionState())



    await persistAllGuideSections(db, SETTLEMENT_ID, payload)

    await persistAllGuideSections(db, SETTLEMENT_ID, payload)



    expect(db.count('meal_items', SETTLEMENT_ID)).toBe(1)

    expect(db.count('entrance_items', SETTLEMENT_ID)).toBe(1)

    expect(db.count('other_expense_items', SETTLEMENT_ID)).toBe(1)

    expect(db.count('shopping_items', SETTLEMENT_ID)).toBe(1)

    expect(db.count('option_items', SETTLEMENT_ID)).toBe(1)

  })



  it('D: editing a meal and saving again keeps exactly one meal row', async () => {

    const db = createInMemoryLineItemDb()

    const createPayload = prepareCreatePayload(oneRowPerSectionState())

    await persistAllGuideSections(db, SETTLEMENT_ID, createPayload)



    const existing = settlementFullFromDb(db, oneRowPerSectionState(SETTLEMENT_ID))

    const hydrated = stateFromSettlementFull(existing, '가이드')

    hydrated.meals[0] = { ...hydrated.meals[0]!, restaurant_name: '식당B', unit_price_vnd: 120000 }



    const editPayload = prepareEditPayload(hydrated, existing)

    await persistAllGuideSections(db, SETTLEMENT_ID, editPayload)



    const meals = db.rows('meal_items', SETTLEMENT_ID)

    expect(meals).toHaveLength(1)

    expect(meals[0]?.restaurant_name).toBe('식당B')

    expect(meals[0]?.unit_price_vnd).toBe(120000)

  })

})



describe('child item save idempotency — hydration and client sync', () => {

  it('C: hydrate existing settlement yields exactly saved rows including options', async () => {

    const db = createInMemoryLineItemDb()

    await persistAllGuideSections(db, SETTLEMENT_ID, prepareCreatePayload(oneRowPerSectionState()))



    const hydrated = stateFromSettlementFull(settlementFullFromDb(db, oneRowPerSectionState(SETTLEMENT_ID)), '가이드')



    expect(hydrated.meals.filter((r) => !r.deleted)).toHaveLength(1)

    expect(hydrated.entrances.filter((r) => !r.deleted)).toHaveLength(1)

    expect(hydrated.others.filter((r) => !r.deleted)).toHaveLength(1)

    expect(hydrated.shoppings.filter((r) => !r.deleted)).toHaveLength(1)

    expect(hydrated.options.filter((r) => !r.deleted && r.is_extra_vehicle !== true)).toHaveLength(1)

    expect(hydrated.options[0]?.option_name).toBe('보트투어')

  })



  it('mergeServerSync replaces client arrays with server rows (no append)', async () => {

    const db = createInMemoryLineItemDb()

    await persistAllGuideSections(db, SETTLEMENT_ID, prepareCreatePayload(oneRowPerSectionState()))



    const client = oneRowPerSectionState(SETTLEMENT_ID)

    client.meals.push({ ...emptyMealRow(), restaurant_name: '중복클라이언트', pax: 1, unit_price_vnd: 1 })



    const full = settlementFullFromDb(db, client)

    const merged = mergeServerSync(client, {

      status: 'draft',

      receipts: [],

      hotels: full.hotels,

      meals: full.meals,

      entrances: full.entrances,

      others: full.others,

      company_expenses: [],

      shoppings: full.shoppings,

      options: full.options,

    })



    expect(merged.meals?.filter((r) => !r.deleted)).toHaveLength(1)

    expect(merged.meals?.[0]?.restaurant_name).toBe('식당A')

    expect(merged.options?.filter((r) => !r.deleted && r.is_extra_vehicle !== true)).toHaveLength(1)

  })

})



describe('child item save idempotency — redirect/new route flow', () => {

  it('E: create → bind id → edit save again does not duplicate child rows', async () => {

    const db = createInMemoryLineItemDb()

    let state = oneRowPerSectionState()



    const firstPayload = prepareCreatePayload(state)

    await persistAllGuideSections(db, SETTLEMENT_ID, firstPayload)



    const bindResult = applyDraftSaveResult(

      {

        ok: true,

        id: SETTLEMENT_ID,

        sync: {

          status: 'draft',

          receipts: [],

          hotels: [],

          meals: db.rows('meal_items', SETTLEMENT_ID) as unknown as SettlementFull['meals'],

          entrances: db.rows('entrance_items', SETTLEMENT_ID) as unknown as SettlementFull['entrances'],

          others: db.rows('other_expense_items', SETTLEMENT_ID) as unknown as SettlementFull['others'],

          company_expenses: [],

          shoppings: db.rows('shopping_items', SETTLEMENT_ID) as unknown as SettlementFull['shoppings'],

          options: db.rows('option_items', SETTLEMENT_ID) as unknown as SettlementFull['options'],

        },

      },

      {

        currentSettlementId: null,

        bindSettlementId: (id) => {

          state = { ...state, settlementId: id }

        },

        markSaved: () => {},

        mergeServerSync: (sync) => {

          state = { ...state, ...mergeServerSync(state, sync) }

        },

        setSaveError: () => {},

      },

    )



    expect(bindResult.becameExistingSettlement).toBe(true)

    expect(state.settlementId).toBe(SETTLEMENT_ID)

    expect(state.meals.filter((r) => !r.deleted)).toHaveLength(1)



    const existing = settlementFullFromDb(db, state)

    const secondPayload = prepareEditPayload(state, existing)

    await persistAllGuideSections(db, SETTLEMENT_ID, secondPayload)



    expect(db.count('meal_items', SETTLEMENT_ID)).toBe(1)

    expect(db.count('option_items', SETTLEMENT_ID)).toBe(1)

  })

})



describe('child item save idempotency — duplicate settlement guard', () => {
  it('F: binding an existing settlement id does not create a second settlement row', () => {
    let boundId: string | null = null
    const first = applyDraftSaveResult(
      { ok: true, id: SETTLEMENT_ID },
      {
        currentSettlementId: null,
        bindSettlementId: (id) => {
          boundId = id
        },
        markSaved: () => {},
        mergeServerSync: () => {},
        setSaveError: () => {},
      },
    )
    const second = applyDraftSaveResult(
      { ok: true, id: SETTLEMENT_ID },
      {
        currentSettlementId: SETTLEMENT_ID,
        bindSettlementId: (id) => {
          boundId = id
        },
        markSaved: () => {},
        mergeServerSync: () => {},
        setSaveError: () => {},
      },
    )

    expect(first.becameExistingSettlement).toBe(true)
    expect(second.becameExistingSettlement).toBe(false)
    expect(boundId).toBe(SETTLEMENT_ID)
  })
})

describe('child item save idempotency — payload diagnostics', () => {

  it('F: hydrated edit payload has no duplicate meal or entrance rows', async () => {
    const db = createInMemoryLineItemDb()
    await persistAllGuideSections(db, SETTLEMENT_ID, prepareCreatePayload(oneRowPerSectionState()))

    const hydrated = stateFromSettlementFull(
      settlementFullFromDb(db, oneRowPerSectionState(SETTLEMENT_ID)),
      '가이드',
    )
    const payload = toDraftPayload(hydrated)

    expect(diagnoseDraftLineItemDuplicates(payload)).toHaveLength(0)
    expect(payload.meals.filter((r) => !r.deleted)).toHaveLength(1)
    expect(payload.entrances.filter((r) => !r.deleted)).toHaveLength(1)
    expect(payload.options.filter((r) => !r.deleted && r.is_extra_vehicle !== true)).toHaveLength(1)
  })

  it('detects duplicate client rows before save and normalizes them', () => {

    const state = oneRowPerSectionState()

    const dup = { ...state.meals[0]! }

    state.meals.push(dup)



    const raw = toDraftPayload(state)

    expect(diagnoseDraftLineItemDuplicates(raw).some((d) => d.section === 'meals')).toBe(true)



    const normalized = normalizeDraftLineItemPayload(raw)

    expect(normalized.meals.filter((r) => !r.deleted)).toHaveLength(1)

    expect(diagnoseDraftLineItemDuplicates(normalized)).toHaveLength(0)

  })



  it('G: all guide child sections follow the same idempotent re-save behavior', async () => {

    const db = createInMemoryLineItemDb()

    const payload = prepareCreatePayload(oneRowPerSectionState())



    for (let i = 0; i < 3; i++) {

      await persistAllGuideSections(db, SETTLEMENT_ID, payload)

    }



    for (const table of [

      'meal_items',

      'entrance_items',

      'other_expense_items',

      'shopping_items',

      'option_items',

    ] as const) {

      expect(db.count(table, SETTLEMENT_ID)).toBe(1)

    }

  })

})


