import { describe, expect, it, vi } from 'vitest'

import {
  KNOWN_ID_DELETE_BATCH_SIZE,
  countPersistGuideLineItemTableRequests,
  deleteKnownLineItemIds,
  persistGuideLineItemTable,
} from './guide-line-item-persist'
import { buildMealDbRows } from './mappers'

function createCountingSupabase() {
  let requestCount = 0

  const supabase = {
    from: vi.fn(() => ({
      delete: vi.fn(() => {
        requestCount += 1
        const chain = {
          in: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        }
        return chain
      }),
      insert: vi.fn().mockImplementation(() => {
        requestCount += 1
        return Promise.resolve({ error: null })
      }),
      update: vi.fn().mockImplementation(() => {
        requestCount += 1
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }),
    })),
    get requestCount() {
      return requestCount
    },
  }

  return supabase
}

function manyMealRows(count: number, settlementId: string) {
  return buildMealDbRows(
    Array.from({ length: count }, (_, i) => ({
      clientId: `meal-${i}`,
      id: `meal-id-${i}`,
      restaurant_name: `Restaurant ${i}`,
      meal_date: '2025-04-01',
      pax: 10,
      unit_price_vnd: 100000,
    })),
    settlementId,
  )
}

describe('line item persist performance', () => {
  it('countPersistGuideLineItemTableRequests reflects batched deletes', () => {
    const sequentialBefore = 40 + 1 + 40
    const optimized = countPersistGuideLineItemTableRequests(40, 1, 40)
    expect(optimized).toBe(1 + 1 + 40)
    expect(optimized).toBeLessThan(sequentialBefore)
  })

  it('deleteKnownLineItemIds batches many ids into one request per chunk', async () => {
    const supabase = createCountingSupabase()
    const ids = Array.from({ length: 25 }, (_, i) => `id-${i}`)

    const result = await deleteKnownLineItemIds(
      supabase as never,
      'meal_items',
      'settlement-1',
      ids,
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.requestCount).toBe(1)
    expect(supabase.requestCount).toBe(1)
  })

  it('deleteKnownLineItemIds splits oversized id lists into multiple batches', async () => {
    const supabase = createCountingSupabase()
    const ids = Array.from(
      { length: KNOWN_ID_DELETE_BATCH_SIZE + 5 },
      (_, i) => `id-${i}`,
    )

    const result = await deleteKnownLineItemIds(
      supabase as never,
      'meal_items',
      'settlement-1',
      ids,
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.requestCount).toBe(2)
    expect(supabase.requestCount).toBe(2)
  })

  it('persistGuideLineItemTable uses one batched delete for many orphan ids', async () => {
    const supabase = createCountingSupabase()
    const deleteIds = Array.from({ length: 30 }, (_, i) => `orphan-${i}`)
    const rows = manyMealRows(35, 'settlement-1')

    const result = await persistGuideLineItemTable(
      supabase as never,
      'meal_items',
      'settlement-1',
      rows,
      deleteIds,
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.requestCount).toBe(countPersistGuideLineItemTableRequests(30, 0, 35))
      expect(result.requestCount).toBe(1 + 35)
    }
    expect(supabase.requestCount).toBe(1 + 35)
  })

  it('unchanged updates are skipped to reduce request count on re-save', async () => {
    const supabase = createCountingSupabase()
    const rows = manyMealRows(10, 'settlement-1')
    const existingById = new Map(
      rows.map((row) => [row.id as string, { ...row }]),
    )

    const result = await persistGuideLineItemTable(
      supabase as never,
      'meal_items',
      'settlement-1',
      rows,
      [],
      existingById,
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.updatesSkipped).toBe(10)
      expect(result.requestCount).toBe(0)
    }
    expect(supabase.requestCount).toBe(0)
  })

  it('reports lower request count than sequential per-id delete would require', () => {
    const rowCount = 50
    const deleteCount = 20
    const sequentialDeletes = deleteCount
    const batchedDeletes = Math.ceil(deleteCount / KNOWN_ID_DELETE_BATCH_SIZE)
    const optimized = countPersistGuideLineItemTableRequests(deleteCount, 0, rowCount)

    expect(batchedDeletes).toBe(1)
    expect(optimized).toBe(batchedDeletes + rowCount)
    expect(optimized).toBeLessThan(sequentialDeletes + rowCount)
  })
})
