import { describe, expect, it } from 'vitest'
import {
  buildGetSettlementFullTimingLog,
  createGetSettlementFullTimer,
} from './get-settlement-full-diagnostics'

describe('getSettlementFull diagnostics', () => {
  it('flags parallel batch when query durations exceed wall-clock batch time', () => {
    const log = buildGetSettlementFullTimingLog({
      settlementId: 'settlement-test',
      callPurpose: 'pre_load',
      settlementQueryMs: 80,
      parallelBatchMs: 120,
      parallelQueries: [
        { query: 'hotel_items', ms: 100, startedOffsetMs: 0 },
        { query: 'meal_items', ms: 95, startedOffsetMs: 0 },
        { query: 'entrance_items', ms: 90, startedOffsetMs: 0 },
      ],
    })

    expect(log.queryCount).toBe(4)
    expect(log.sumQueryMs).toBe(80 + 100 + 95 + 90)
    expect(log.parallelismRatio).toBeGreaterThan(1.3)
    expect(log.appearsParallel).toBe(true)
  })

  it('flags serialized pattern when batch wall clock approximates sum of queries', () => {
    const log = buildGetSettlementFullTimingLog({
      settlementId: 'settlement-test',
      callPurpose: 'post_save_reload',
      settlementQueryMs: 50,
      parallelBatchMs: 300,
      parallelQueries: [
        { query: 'hotel_items', ms: 100, startedOffsetMs: 0 },
        { query: 'meal_items', ms: 100, startedOffsetMs: 100 },
        { query: 'entrance_items', ms: 100, startedOffsetMs: 200 },
      ],
    })

    expect(log.appearsParallel).toBe(false)
    expect(log.queries.every((q) => q.ms >= 0)).toBe(true)
  })

  it('records per-query timings from timer helper', async () => {
    const timer = createGetSettlementFullTimer()
    timer.startParallelBatch()
    await Promise.all([
      timer.timedQuery('hotel_items', async () => undefined),
      timer.timedQuery('meal_items', async () => undefined),
    ])
    timer.endParallelBatch()

    expect(timer.queries).toHaveLength(2)
    expect(timer.queries.every((q) => q.startedOffsetMs === 0)).toBe(true)
  })
})
