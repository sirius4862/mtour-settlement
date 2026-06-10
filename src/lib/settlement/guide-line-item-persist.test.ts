import { describe, expect, it, vi } from 'vitest'

import { buildMealDbRows, buildOtherDbRows } from './mappers'

import {

  explicitDeleteIdsFromDraft,

  persistGuideLineItemTable,

} from './guide-line-item-persist'



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

})


