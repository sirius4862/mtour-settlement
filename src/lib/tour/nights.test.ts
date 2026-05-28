import { describe, expect, it } from 'vitest'
import { calcTourNights } from './nights'

describe('calcTourNights', () => {
  it('computes nights from start and end date', () => {
    expect(calcTourNights('2026-05-01', '2026-05-04')).toBe(3)
  })

  it('returns 0 when same day', () => {
    expect(calcTourNights('2026-05-01', '2026-05-01')).toBe(0)
  })
})
