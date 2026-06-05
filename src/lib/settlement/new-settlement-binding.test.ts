import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  resolveNewSettlementBinding,
  resolveRequestedTourId,
} from './new-settlement-binding'

const ROOT = process.cwd()

// Scenario from the production bug report:
//  - Guide 박영민 has assigned tours 260426GA and 260417GAA.
//  - A 수정 필요 settlement for tour 260510 exists and was opened in edit mode,
//    leaving its settlementId persisted in the form store (sessionStorage).
const GUIDE = '박영민'
const TOUR_260426GA = 'tour-260426GA'
const TOUR_260417GAA = 'tour-260417GAA'
const TOUR_260510 = 'tour-260510'
const SETTLEMENT_260510 = 'settlement-260510'

describe('resolveNewSettlementBinding', () => {
  it('binds the first assigned tour and never inherits a leaked existing settlement (260510)', () => {
    const decision = resolveNewSettlementBinding(
      { settlementId: SETTLEMENT_260510, tourId: TOUR_260510, guideName: GUIDE },
      TOUR_260426GA,
      GUIDE,
    )
    expect(decision.reset).toBe(true)
    expect(decision.bindTourId).toBe(TOUR_260426GA)
    expect(decision.bindTourId).not.toBe(TOUR_260510)
  })

  it('binds the second assigned tour and never inherits 260510', () => {
    const decision = resolveNewSettlementBinding(
      { settlementId: SETTLEMENT_260510, tourId: TOUR_260510, guideName: GUIDE },
      TOUR_260417GAA,
      GUIDE,
    )
    expect(decision.reset).toBe(true)
    expect(decision.bindTourId).toBe(TOUR_260417GAA)
    expect(decision.bindTourId).not.toBe(TOUR_260510)
  })

  it('binds the selected tour even when no prior state is persisted', () => {
    const decision = resolveNewSettlementBinding(
      { settlementId: null, tourId: null, guideName: GUIDE },
      TOUR_260426GA,
      GUIDE,
    )
    expect(decision.reset).toBe(true)
    expect(decision.bindTourId).toBe(TOUR_260426GA)
  })

  it('preserves a clean unsaved new draft for the exact same tour + guide', () => {
    const decision = resolveNewSettlementBinding(
      { settlementId: null, tourId: TOUR_260426GA, guideName: GUIDE },
      TOUR_260426GA,
      GUIDE,
    )
    expect(decision.reset).toBe(false)
    expect(decision.bindTourId).toBe(TOUR_260426GA)
  })

  it('resets when switching to a different assigned tour even without an existing settlement', () => {
    const decision = resolveNewSettlementBinding(
      { settlementId: null, tourId: TOUR_260426GA, guideName: GUIDE },
      TOUR_260417GAA,
      GUIDE,
    )
    expect(decision.reset).toBe(true)
    expect(decision.bindTourId).toBe(TOUR_260417GAA)
  })

  it('resets when the persisted draft belongs to a different guide', () => {
    const decision = resolveNewSettlementBinding(
      { settlementId: null, tourId: TOUR_260426GA, guideName: '다른 가이드' },
      TOUR_260426GA,
      GUIDE,
    )
    expect(decision.reset).toBe(true)
    expect(decision.bindTourId).toBe(TOUR_260426GA)
  })

  it('without a selected tour, resets to clear a leaked existing settlement (no fallback)', () => {
    const decision = resolveNewSettlementBinding(
      { settlementId: SETTLEMENT_260510, tourId: TOUR_260510, guideName: GUIDE },
      null,
      GUIDE,
    )
    expect(decision.reset).toBe(true)
    expect(decision.bindTourId).toBeNull()
  })

  it('without a selected tour, keeps a clean unsaved draft for the same guide', () => {
    const decision = resolveNewSettlementBinding(
      { settlementId: null, tourId: null, guideName: GUIDE },
      null,
      GUIDE,
    )
    expect(decision.reset).toBe(false)
    expect(decision.bindTourId).toBeNull()
  })
})

describe('resolveRequestedTourId (guide-scoped)', () => {
  const tours = [{ id: TOUR_260426GA }, { id: TOUR_260417GAA }]

  it('accepts a tour id that belongs to the guide assigned-tour list', () => {
    expect(resolveRequestedTourId(tours, TOUR_260426GA)).toBe(TOUR_260426GA)
    expect(resolveRequestedTourId(tours, TOUR_260417GAA)).toBe(TOUR_260417GAA)
  })

  it('rejects a tour id that is not in the guide assigned-tour list (e.g. 260510)', () => {
    expect(resolveRequestedTourId(tours, TOUR_260510)).toBeNull()
  })

  it('ignores missing or array params', () => {
    expect(resolveRequestedTourId(tours, undefined)).toBeNull()
    expect(resolveRequestedTourId(tours, [])).toBeNull()
    expect(resolveRequestedTourId(tours, [TOUR_260426GA])).toBe(TOUR_260426GA)
  })
})

describe('guide create-flow wiring (regression source guards)', () => {
  const dashboard = readFileSync(join(ROOT, 'src/app/guide/page.tsx'), 'utf8')
  const newPage = readFileSync(
    join(ROOT, 'src/app/guide/settlements/new/page.tsx'),
    'utf8',
  )
  const form = readFileSync(
    join(ROOT, 'src/components/settlement/SettlementForm.tsx'),
    'utf8',
  )

  it('assigned-tour card link carries the exact tour id', () => {
    expect(dashboard).toContain('/guide/settlements/new?tourId=${t.id}')
    expect(dashboard).not.toContain('href="/guide/settlements/new"')
  })

  it('작성중 and 수정 필요 links open their own settlement record by id', () => {
    expect(dashboard).toContain('href={`/guide/settlements/${s.id}/edit`}')
  })

  it('new page validates the requested tour against guide-scoped tours', () => {
    expect(newPage).toContain('resolveRequestedTourId')
    expect(newPage).toContain('getAvailableTours')
    expect(newPage).toContain('initialTourId')
  })

  it('settlement form binds new mode via resolveNewSettlementBinding (no guideName-only reset)', () => {
    expect(form).toContain('resolveNewSettlementBinding')
    expect(form).not.toContain('if (s.guideName !== guideName) {')
  })
})
