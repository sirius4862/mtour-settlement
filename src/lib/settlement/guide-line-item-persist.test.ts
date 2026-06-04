import { describe, expect, it, vi } from 'vitest'
import { buildOtherDbRows } from './mappers'
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
  it('deletes explicit soft-deleted row ids without listing the table', async () => {
    const deleteChain = {
      eq: vi.fn().mockReturnThis(),
    }
    deleteChain.eq.mockImplementation(function (this: typeof deleteChain, ...args: unknown[]) {
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

  it('fails when explicit delete removes zero rows (RLS or stale id)', async () => {
    const deleteChain = {
      eq: vi.fn().mockReturnThis(),
    }
    deleteChain.eq.mockImplementation(function (this: typeof deleteChain, ...args: unknown[]) {
      if (args[0] === 'settlement_id') {
        return Promise.resolve({ error: null, count: 0 })
      }
      return deleteChain
    })
    const supabase = {
      from: vi.fn(() => ({
        delete: vi.fn().mockReturnValue(deleteChain),
        insert: vi.fn(),
        update: vi.fn(),
      })),
    }

    const result = await persistGuideLineItemTable(
      supabase as never,
      'other_expense_items',
      'settlement-1',
      [],
      ['id-missing'],
    )

    expect(result.ok).toBe(false)
    expect(result.error).toContain('line_item_delete_failed')
  })
})
