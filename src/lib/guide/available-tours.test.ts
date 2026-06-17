import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  GUIDE_AVAILABLE_TOUR_SELECT,
  GUIDE_DASHBOARD_AVAILABLE_TOUR_SELECT,
  collectUsedTourIds,
  filterToursWithoutSettlements,
} from './available-tours'

const ROOT = process.cwd()

type TourRow = {
  id: string
  tour_code: string
  pattern: string
}

function tour(id: string): TourRow {
  return { id, tour_code: id, pattern: `Tour ${id}` }
}

describe('collectUsedTourIds', () => {
  it('skips null and undefined tour_id values', () => {
    expect(
      collectUsedTourIds([
        { tour_id: 't1' },
        { tour_id: null },
        { tour_id: undefined },
        {},
      ]),
    ).toEqual(new Set(['t1']))
  })

  it('returns an empty set for empty input', () => {
    expect(collectUsedTourIds([])).toEqual(new Set())
    expect(collectUsedTourIds(null)).toEqual(new Set())
  })
})

describe('filterToursWithoutSettlements', () => {
  it('excludes tours with existing settlements', () => {
    const tours = [tour('a'), tour('b'), tour('c')]
    expect(filterToursWithoutSettlements(tours, new Set(['b']))).toEqual([tour('a'), tour('c')])
  })

  it('includes tours without settlements', () => {
    const tours = [tour('a'), tour('b')]
    expect(filterToursWithoutSettlements(tours, new Set())).toEqual(tours)
    expect(filterToursWithoutSettlements(tours, [])).toEqual(tours)
  })

  it('preserves input sort order', () => {
    const tours = [tour('z'), tour('m'), tour('a')]
    expect(filterToursWithoutSettlements(tours, new Set(['m']))).toEqual([tour('z'), tour('a')])
  })

  it('accepts readonly string arrays for used tour ids', () => {
    const tours = [tour('a'), tour('b')]
    expect(filterToursWithoutSettlements(tours, ['b'])).toEqual([tour('a')])
  })
})

describe('guide available tour loader wiring', () => {
  function actionsBodyBetween(startMarker: string, endMarker: string): string {
    const actions = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')
    const start = actions.indexOf(startMarker)
    const end = actions.indexOf(endMarker, start)
    return actions.slice(start, end)
  }

  it('parallelizes tours and settlement tour_id queries', () => {
    const body = actionsBodyBetween('async function loadGuideTourAvailability', 'export async function getAvailableTours')
    expect(body).toContain('Promise.all')
    expect(body).toContain("from('tours')")
    expect(body).toContain('tour_id')
  })

  it('dashboard loader uses the slim dashboard select', () => {
    const body = actionsBodyBetween(
      'export async function getGuideDashboardAvailableTours',
      'const LINE_ITEM_TABLES',
    )
    expect(body).toContain('GUIDE_DASHBOARD_AVAILABLE_TOUR_SELECT')
    expect(body).not.toContain('GUIDE_AVAILABLE_TOUR_SELECT')
    expect(body).toContain('filterToursWithoutSettlements')
    expect(GUIDE_DASHBOARD_AVAILABLE_TOUR_SELECT).toBe(
      'id,tour_code,pattern,agency_name,start_date,end_date,pax_count',
    )
    expect(GUIDE_DASHBOARD_AVAILABLE_TOUR_SELECT).not.toContain('vehicle_type')
    expect(GUIDE_DASHBOARD_AVAILABLE_TOUR_SELECT).not.toContain('branch_id')
  })

  it('shared getAvailableTours keeps the full form select and exclusion helper', () => {
    const body = actionsBodyBetween('export async function getAvailableTours', 'export async function getGuideDashboardAvailableTours')
    expect(body).toContain('GUIDE_AVAILABLE_TOUR_SELECT')
    expect(body).toContain('filterToursWithoutSettlements')
    expect(GUIDE_AVAILABLE_TOUR_SELECT).toContain('vehicle_type')
    expect(GUIDE_AVAILABLE_TOUR_SELECT).toContain('branch_id')
  })

  it('excludes recalled tours and does not add a date cutoff', () => {
    const body = actionsBodyBetween('async function loadGuideTourAvailability', 'const LINE_ITEM_TABLES')
    expect(body).toContain(".neq('assignment_status', 'recalled')")
    expect(body).not.toContain('90 * 24 * 60 * 60 * 1000')
    expect(body).not.toContain(".gte('start_date', since)")
    expect(body).not.toContain(".not('id', 'in'")
  })

  it('new settlement page uses getAvailableTours; edit page uses full.tour only', () => {
    const newPage = readFileSync(join(ROOT, 'src/app/guide/settlements/new/page.tsx'), 'utf8')
    const editPage = readFileSync(join(ROOT, 'src/app/guide/settlements/[id]/edit/page.tsx'), 'utf8')

    expect(newPage).toContain('getAvailableTours')
    expect(newPage).not.toContain('getGuideDashboardAvailableTours')
    expect(editPage).not.toContain('getAvailableTours')
    expect(editPage).not.toContain('getGuideDashboardAvailableTours')
    expect(editPage).toContain('getSettlementFullForGuide')
    expect(editPage).toMatch(/tours\s*=\s*\[\s*full\.tour\s*\]/)
  })

  it('guide dashboard page uses getGuideDashboardAvailableTours', () => {
    const dashboard = readFileSync(join(ROOT, 'src/app/guide/page.tsx'), 'utf8')
    expect(dashboard).toContain('getGuideDashboardAvailableTours')
    expect(dashboard).not.toContain('getAvailableTours')
  })

  it('does not modify settlement save files', () => {
    const noop = readFileSync(join(ROOT, 'src/lib/settlement/noop-draft-save-fast-path.ts'), 'utf8')
    expect(noop).toContain('canSkipPostSaveReloadForNoopSave')
    expect(noop).not.toContain('getGuideDashboardAvailableTours')
  })
})
