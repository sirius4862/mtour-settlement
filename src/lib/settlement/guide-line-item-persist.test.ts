import { describe, expect, it, vi } from 'vitest'

import { buildMealDbRows, buildOptionDbRows, buildOtherDbRows } from './mappers'

import {
  explicitDeleteIdsFromDraft,
  filterRowsNeedingUpdate,
  normalizeComparableLineItemValue,
  optionPatchDiffersFromExisting,
  persistGuideLineItemTable,
  rowPatchDiffersFromExisting,
} from './guide-line-item-persist'



describe('option_items unchanged row skipping', () => {
  const existingOption = {
    id: 'opt-1',
    settlement_id: 's1',
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
  }

  it('treats derived total_sale_usd/com_usd drift as unchanged when source fields match', () => {
    const patch = buildOptionDbRows(
      [
        {
          clientId: 'c1',
          id: 'opt-1',
          option_date: '2026-04-02',
          option_name: '보트투어',
          unit_price_usd: 25,
          pax: 8,
          expense_usd: 10,
          expense_vnd: 0,
          is_extra_vehicle: false,
        },
      ],
      's1',
      26000,
    )[0]!

    expect(optionPatchDiffersFromExisting(patch, existingOption)).toBe(false)
    expect(rowPatchDiffersFromExisting(patch, existingOption, 'option_items')).toBe(false)
  })

  it('detects a changed option_name', () => {
    const patch = { ...existingOption, option_name: '변경됨' }
    expect(optionPatchDiffersFromExisting(patch, existingOption)).toBe(true)
  })

  it('normalizes null option_date, numeric strings, and is_extra_vehicle', () => {
    const patch = buildOptionDbRows(
      [
        {
          clientId: 'c1',
          id: 'opt-1',
          option_date: null,
          option_name: '보트투어',
          unit_price_usd: '25' as unknown as number,
          pax: 8,
          expense_usd: 10,
          expense_vnd: 0,
        },
      ],
      's1',
      26000,
    )[0]!
    const existing = { ...existingOption, option_date: null, is_extra_vehicle: null }

    expect(normalizeComparableLineItemValue('is_extra_vehicle', undefined)).toBe(false)
    expect(optionPatchDiffersFromExisting(patch, existing)).toBe(false)
  })

  it('skips all unchanged option rows in filterRowsNeedingUpdate', () => {
    const existing = new Map([['opt-1', existingOption]])
    const toUpdate = buildOptionDbRows(
      [
        {
          clientId: 'c1',
          id: 'opt-1',
          option_date: '2026-04-02',
          option_name: '보트투어',
          unit_price_usd: 25,
          pax: 8,
          expense_usd: 10,
          expense_vnd: 0,
          is_extra_vehicle: false,
        },
      ],
      's1',
      26000,
    )

    const { rows, skipped } = filterRowsNeedingUpdate(toUpdate, existing, 'option_items')
    expect(skipped).toBe(1)
    expect(rows).toHaveLength(0)
  })

  it('persists exactly one update when a single option field changes', async () => {
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

    const existingById = new Map([['opt-1', existingOption]])
    const rows = buildOptionDbRows(
      [
        {
          clientId: 'c1',
          id: 'opt-1',
          option_date: '2026-04-02',
          option_name: '보트투어(수정)',
          unit_price_usd: 25,
          pax: 8,
          expense_usd: 10,
          expense_vnd: 0,
          is_extra_vehicle: false,
        },
      ],
      's1',
      26000,
    )

    const result = await persistGuideLineItemTable(
      supabase as never,
      'option_items',
      's1',
      rows,
      [],
      existingById,
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.requestCount).toBe(1)
      expect(result.updatesSkipped).toBe(0)
    }
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('skips unchanged extra-vehicle admin rows', async () => {
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

    const extraExisting = {
      id: 'opt-extra',
      settlement_id: 's1',
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
    }
    const existingById = new Map<string, Record<string, unknown>>([
      ['opt-1', existingOption],
      ['opt-extra', extraExisting],
    ])
    const rows = buildOptionDbRows(
      [
        {
          clientId: 'c1',
          id: 'opt-1',
          option_date: '2026-04-02',
          option_name: '보트투어',
          unit_price_usd: 25,
          pax: 8,
          expense_usd: 10,
          expense_vnd: 0,
          is_extra_vehicle: false,
        },
        {
          clientId: 'c2',
          id: 'opt-extra',
          option_date: null,
          option_name: '차량비(추가)',
          unit_price_usd: 0,
          pax: 0,
          expense_usd: 35,
          expense_vnd: 780000,
          is_extra_vehicle: true,
        },
      ],
      's1',
      26000,
    )

    const result = await persistGuideLineItemTable(
      supabase as never,
      'option_items',
      's1',
      rows,
      [],
      existingById,
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.requestCount).toBe(0)
      expect(result.updatesSkipped).toBe(2)
    }
    expect(update).not.toHaveBeenCalled()
  })
})

describe('unchanged row update skipping', () => {
  it('rowPatchDiffersFromExisting returns false when patch matches existing', () => {
    const existing = {
      id: 'meal-1',
      settlement_id: 's1',
      restaurant_name: 'Pho',
      pax: 2,
      unit_price_vnd: 100000,
      amount_vnd: 200000,
      sort_order: 0,
    }
    expect(rowPatchDiffersFromExisting(existing, existing)).toBe(false)
  })

  it('filterRowsNeedingUpdate skips unchanged rows', () => {
    const existing = new Map([
      [
        'meal-1',
        {
          id: 'meal-1',
          settlement_id: 's1',
          restaurant_name: 'Pho',
          pax: 2,
          unit_price_vnd: 100000,
          amount_vnd: 200000,
          sort_order: 0,
        },
      ],
    ])
    const toUpdate = [
      {
        id: 'meal-1',
        settlement_id: 's1',
        restaurant_name: 'Pho',
        pax: 2,
        unit_price_vnd: 100000,
        amount_vnd: 200000,
        sort_order: 0,
      },
      {
        id: 'meal-2',
        settlement_id: 's1',
        restaurant_name: 'Changed',
        pax: 3,
        unit_price_vnd: 100000,
        amount_vnd: 300000,
        sort_order: 1,
      },
    ]
    const { rows, skipped } = filterRowsNeedingUpdate(toUpdate, existing)
    expect(skipped).toBe(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe('meal-2')
  })
})

describe('explicitDeleteIdsFromDraft', () => {

  it('collects ids from soft-deleted rows', () => {

    expect(

      explicitDeleteIdsFromDraft([

        { id: 'id-1', deleted: true },

        { id: 'id-2' },

        { id: 'id-x', deleted: true },

      ]),

    ).toEqual(['id-1', 'id-x'])

  })

})



describe('buildOtherDbRows', () => {

  it('excludes soft-deleted rows from persist payload', () => {

    const rows = buildOtherDbRows(

      [

        {

          clientId: 'a',

          id: 'id-1',

          description: 'dup',

          amount_usd: 10,

          amount_vnd: 0,

          note: null,

          deleted: true,

        },

        {

          clientId: 'b',

          id: 'id-2',

          description: 'dup',

          amount_usd: 10,

          amount_vnd: 0,

          note: null,

        },

      ],

      'settlement-1',

    )

    expect(rows).toHaveLength(1)

    expect(rows[0].id).toBe('id-2')

  })

})



describe('persistGuideLineItemTable', () => {

  it('deletes orphan row ids by id before insert (guide-safe, no bulk delete)', async () => {

    const tables = new Map<string, Record<string, unknown>[]>()

    tables.set('meal_items', [

      {

        id: 'old-meal-1',

        settlement_id: 'settlement-1',

        restaurant_name: 'Old',

        pax: 1,

        unit_price_vnd: 1000,

        amount_vnd: 1000,

        sort_order: 0,

      },

    ])



    const supabase = {

      from(table: string) {

        const getRows = () => tables.get(table) ?? []

        const setRows = (rows: Record<string, unknown>[]) => tables.set(table, rows)



        return {

          delete() {

            let rowIds: string[] | null = null

            let settlementId: string | undefined

            const applyDelete = () => {

              if (!rowIds || !settlementId) return chain

              const idSet = new Set(rowIds)

              setRows(

                getRows().filter(

                  (r) => !(idSet.has(r.id as string) && r.settlement_id === settlementId),

                ),

              )

              return Promise.resolve({ error: null })

            }

            const chain = {

              in(col: string, vals: string[]) {

                if (col === 'id') rowIds = vals

                return chain

              },

              eq(col: string, val: string) {

                if (col === 'settlement_id') settlementId = val

                return applyDelete()

              },

            }

            return chain

          },

          insert(rows: Record<string, unknown>[]) {

            setRows([...getRows(), ...rows.map((r, i) => ({ ...r, id: `new-${i}` }))])

            return Promise.resolve({ error: null })

          },

          update: vi.fn(),

        }

      },

    }



    const result = await persistGuideLineItemTable(

      supabase as never,

      'meal_items',

      'settlement-1',

      buildMealDbRows(

        [

          {

            clientId: 'meal-new',

            restaurant_name: 'New',

            meal_date: null,

            pax: 2,

            unit_price_vnd: 2000,

          },

        ],

        'settlement-1',

      ),

      ['old-meal-1'],

    )



    expect(result.ok).toBe(true)

    const saved = tables.get('meal_items') ?? []

    expect(saved.filter((r) => r.settlement_id === 'settlement-1')).toHaveLength(1)

    expect(saved[0]?.restaurant_name).toBe('New')

  })



  it('deletes known ids in one batched request without count=exact', async () => {

    const deleteIn = vi.fn().mockReturnValue({

      eq: vi.fn().mockResolvedValue({ error: null }),

    })

    const deleteFn = vi.fn(() => ({

      in: deleteIn,

    }))

    const supabase = {

      from: vi.fn(() => ({

        delete: deleteFn,

        insert: vi.fn().mockResolvedValue({ error: null }),

        update: vi.fn().mockReturnValue({

          eq: vi.fn().mockReturnValue({

            eq: vi.fn().mockResolvedValue({ error: null }),

          }),

        }),

      })),

    }



    const result = await persistGuideLineItemTable(

      supabase as never,

      'other_expense_items',

      'settlement-1',

      buildOtherDbRows(

        [

          {

            clientId: 'b',

            id: 'id-2',

            description: 'dup',

            amount_usd: 10,

            amount_vnd: 0,

            note: null,

          },

        ],

        'settlement-1',

      ),

      ['id-1'],

    )



    expect(result.ok).toBe(true)

    expect(deleteFn).toHaveBeenCalledTimes(1)

    expect(deleteIn).toHaveBeenCalledWith('id', ['id-1'])

  })



  it('treats missing delete target as an idempotent no-op', async () => {

    const insert = vi.fn().mockResolvedValue({ error: null })

    const supabase = {

      from: vi.fn(() => ({

        delete: vi.fn().mockReturnValue({

          in: vi.fn().mockReturnValue({

            eq: vi.fn().mockResolvedValue({ error: null }),

          }),

        }),

        insert,

        update: vi.fn(),

      })),

    }



    const result = await persistGuideLineItemTable(

      supabase as never,

      'other_expense_items',

      'settlement-1',

      buildOtherDbRows(

        [

          {

            clientId: 'keep',

            description: 'kept',

            amount_usd: 10,

            amount_vnd: 0,

            note: null,

          },

        ],

        'settlement-1',

      ),

      ['id-missing'],

    )



    expect(result.ok).toBe(true)

    expect(insert).toHaveBeenCalledTimes(1)

  })

  it('skips per-row UPDATE when existing row is unchanged', async () => {
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

    const existingRow = {
      id: 'meal-1',
      settlement_id: 'settlement-1',
      meal_date: '2025-04-01',
      restaurant_name: 'Pho',
      pax: 2,
      unit_price_vnd: 100000,
      amount_vnd: 200000,
      sort_order: 0,
    }
    const existingById = new Map([['meal-1', existingRow]])

    const result = await persistGuideLineItemTable(
      supabase as never,
      'meal_items',
      'settlement-1',
      [existingRow],
      [],
      existingById,
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.updatesSkipped).toBe(1)
      expect(result.requestCount).toBe(0)
    }
    expect(update).not.toHaveBeenCalled()
  })

})


