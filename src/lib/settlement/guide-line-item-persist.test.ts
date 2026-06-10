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
  it('deletes orphan rows not in keepIds before insert (idempotent re-save)', async () => {
    const existingRows = [
      {
        id: 'old-meal-1',
        settlement_id: 'settlement-1',
        restaurant_name: 'Old',
        pax: 1,
        unit_price_vnd: 1000,
        amount_vnd: 1000,
        sort_order: 0,
      },
    ]
    const tables = new Map<string, Record<string, unknown>[]>()
    tables.set('meal_items', [...existingRows])

    const supabase = {
      from(table: string) {
        const getRows = () => tables.get(table) ?? []
        const setRows = (rows: Record<string, unknown>[]) => tables.set(table, rows)

        return {
          delete() {
            let settlementId: string | undefined
            let keepIds: string[] | undefined
            const chain = {
              eq(col: string, val: string) {
                if (col === 'settlement_id') settlementId = val
                return chain
              },
              not(col: string, _op: string, val: string) {
                if (col === 'id') {
                  keepIds = val
                    .replace(/^\(/, '')
                    .replace(/\)$/, '')
                    .split(',')
                    .map((s) => s.trim().replace(/^"/, '').replace(/"$/, ''))
                    .filter(Boolean)
                }
                const rows = getRows()
                const kept = rows.filter(
                  (r) =>
                    r.settlement_id !== settlementId ||
                    (keepIds?.includes(r.id as string) ?? false),
                )
                setRows(kept)
                return Promise.resolve({ error: null, count: rows.length - kept.length })
              },
              then(onFulfilled?: (v: { error: null; count: number }) => unknown) {
                const rows = getRows()
                const kept = rows.filter((r) => r.settlement_id !== settlementId)
                setRows(kept)
                return Promise.resolve({ error: null, count: rows.length - kept.length }).then(onFulfilled)
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
      [],
    )

    expect(result.ok).toBe(true)
    const saved = tables.get('meal_items') ?? []
    expect(saved.filter((r) => r.settlement_id === 'settlement-1')).toHaveLength(1)
    expect(saved[0]?.restaurant_name).toBe('New')
  })

  it('deletes explicit soft-deleted row ids without listing the table', async () => {
    const deleteChain = {
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      then(onFulfilled?: (v: { error: null; count: number }) => unknown) {
        return Promise.resolve({ error: null, count: 0 }).then(onFulfilled)
      },
    }
    deleteChain.not.mockImplementation(() =>
      Promise.resolve({ error: null, count: 0 }),
    )
    deleteChain.eq.mockImplementation(function (this: typeof deleteChain, ...args: unknown[]) {
      if (args[0] === 'settlement_id' && args[1] === 'settlement-1') {
        return deleteChain
      }
      if (args[0] === 'settlement_id') {
        return Promise.resolve({ error: null, count: 1 })
      }
      return deleteChain
    })
    const deleteEq = vi.fn().mockReturnValue(deleteChain)
    const supabase = {
      from: vi.fn(() => ({
        delete: deleteEq,
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
    expect(deleteEq).toHaveBeenCalledWith({ count: 'exact' })
    expect(deleteChain.eq).toHaveBeenCalledWith('id', 'id-1')
    expect(deleteChain.eq).toHaveBeenCalledWith('settlement_id', 'settlement-1')
  })

  it('treats explicit delete with zero rows as an idempotent no-op', async () => {
    const deleteChain = {
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      then(onFulfilled?: (v: { error: null; count: number }) => unknown) {
        return Promise.resolve({ error: null, count: 0 }).then(onFulfilled)
      },
    }
    deleteChain.eq.mockImplementation(function (this: typeof deleteChain, ...args: unknown[]) {
      if (args[0] === 'settlement_id') {
        return Promise.resolve({ error: null, count: 0 })
      }
      return deleteChain
    })
    const insert = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn(() => ({
        delete: vi.fn().mockReturnValue(deleteChain),
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
