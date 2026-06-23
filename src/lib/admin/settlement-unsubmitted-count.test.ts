import { describe, expect, it } from 'vitest'
import { resolveAdminRegionFilter } from '@/lib/region/permissions'
import type { AdminSettlementListItem } from './settlement-list'
import { paginateSortedAdminSettlementRows } from './settlement-list'
import {
  computeAdminUnsubmittedTotal,
  computeAdminUnsubmittedTotalFromRows,
  countAdminUnsubmittedWithoutSearch,
  mergeAdminUnsubmittedListItems,
  type AdminUnsubmittedTourRow,
} from './settlement-unsubmitted-list'

const branchDanang = { id: 'danang', name: 'Da Nang', code: 'DANANG' }
const branchHanoi = { id: 'hanoi', name: 'Hanoi', code: 'HANOI' }

function tour(overrides: Partial<AdminUnsubmittedTourRow> & { id: string }): AdminUnsubmittedTourRow {
  return {
    pattern: 'Tour',
    tour_code: overrides.id,
    start_date: '2026-04-15',
    pax_count: 10,
    branch_id: 'danang',
    guide_id: 'guide-1',
    assignment_status: 'assigned',
    created_at: '2026-04-01T00:00:00Z',
    guide: {
      id: 'guide-1',
      full_name: 'Kim Guide',
      email: 'kim@example.com',
      korean_name: '김가이드',
      vietnamese_name: null,
    },
    branch: branchDanang,
    ...overrides,
  }
}

function settlement(
  overrides: Partial<AdminSettlementListItem> & {
    id: string
    status: AdminSettlementListItem['status']
    tourId: string
  },
): AdminSettlementListItem {
  return {
    year_month: '2026-04',
    updated_at: '2026-04-10T00:00:00Z',
    submitted_at: null,
    guide_confirmed_at: null,
    branch_id: overrides.branch_id ?? 'danang',
    calc_summary_json: null,
    guide: tour({ id: overrides.tourId }).guide,
    branch: branchDanang,
    tour: {
      id: overrides.tourId,
      pattern: 'Tour',
      tour_code: overrides.tourId,
      start_date: '2026-04-15',
      pax_count: 10,
    },
    ...overrides,
  }
}

function legacyUnsubmittedTotal(
  tours: AdminUnsubmittedTourRow[],
  settlements: AdminSettlementListItem[],
  search?: string,
  page = 1,
  pageSize = 1,
): number {
  return paginateSortedAdminSettlementRows(
    mergeAdminUnsubmittedListItems(tours, settlements, search),
    { page, pageSize },
  ).total
}

function filterToursByRegion(tours: AdminUnsubmittedTourRow[], regionId?: string) {
  if (!regionId) return tours
  return tours.filter((row) => row.branch_id === regionId)
}

describe('getAdminUnsubmittedCount parity (pure simulation)', () => {
  it('returns 0 for empty data', () => {
    expect(computeAdminUnsubmittedTotalFromRows([], [])).toBe(0)
    expect(legacyUnsubmittedTotal([], [])).toBe(0)
  })

  it('counts eligible tour with no settlement', () => {
    const tours = [tour({ id: 'tour-a' })]
    expect(computeAdminUnsubmittedTotalFromRows(tours, [])).toBe(1)
    expect(legacyUnsubmittedTotal(tours, [])).toBe(1)
  })

  it('counts draft settlement and dedups eligible tour + draft settlement once', () => {
    const tours = [tour({ id: 'tour-a' }), tour({ id: 'tour-b' })]
    const settlements = [settlement({ id: 's-draft', status: 'draft', tourId: 'tour-b' })]
    expect(computeAdminUnsubmittedTotalFromRows(tours, settlements)).toBe(2)
    expect(legacyUnsubmittedTotal(tours, settlements)).toBe(2)
  })

  it('excludes non-draft settlements and edit_requested/submitted/paid tours', () => {
    const tours = [
      tour({ id: 'tour-submitted' }),
      tour({ id: 'tour-edit' }),
      tour({ id: 'tour-paid' }),
    ]
    const settlements = [
      settlement({ id: 's-submitted', status: 'submitted', tourId: 'tour-submitted' }),
      settlement({ id: 's-edit', status: 'edit_requested', tourId: 'tour-edit' }),
      settlement({ id: 's-paid', status: 'paid', tourId: 'tour-paid' }),
    ]
    expect(computeAdminUnsubmittedTotalFromRows(tours, settlements)).toBe(0)
  })

  it('scopes counts to a single region for regional admin', () => {
    const tours = [
      tour({ id: 'tour-danang', branch_id: 'danang', branch: branchDanang }),
      tour({ id: 'tour-hanoi', branch_id: 'hanoi', branch: branchHanoi }),
    ]
    const scoped = filterToursByRegion(tours, 'danang')
    expect(computeAdminUnsubmittedTotalFromRows(scoped, [])).toBe(1)
  })

  it('master_admin unbounded scope counts all regions', () => {
    const tours = [
      tour({ id: 'tour-danang', branch_id: 'danang', branch: branchDanang }),
      tour({ id: 'tour-hanoi', branch_id: 'hanoi', branch: branchHanoi }),
    ]
    const regionId = resolveAdminRegionFilter(
      { role: 'master_admin', assignedRegionId: null },
      undefined,
    )
    expect(regionId).toBeUndefined()
    expect(computeAdminUnsubmittedTotalFromRows(tours, [])).toBe(2)
  })

  it('regional admin forced scope ignores cross-region tours', () => {
    const tours = [
      tour({ id: 'tour-danang', branch_id: 'danang', branch: branchDanang }),
      tour({ id: 'tour-hanoi', branch_id: 'hanoi', branch: branchHanoi }),
    ]
    const regionId = resolveAdminRegionFilter(
      { role: 'admin', assignedRegionId: 'danang' },
      'hanoi',
    )
    expect(regionId).toBe('danang')
    expect(computeAdminUnsubmittedTotalFromRows(filterToursByRegion(tours, regionId), [])).toBe(1)
  })

  it('empty regional scope for assigned branch with no tours returns 0', () => {
    const tours = [tour({ id: 'tour-hanoi', branch_id: 'hanoi', branch: branchHanoi })]
    const regionId = resolveAdminRegionFilter(
      { role: 'admin', assignedRegionId: 'danang' },
      undefined,
    )
    expect(computeAdminUnsubmittedTotalFromRows(filterToursByRegion(tours, regionId), [])).toBe(0)
  })

  it('is pagination independent for total', () => {
    const tours = Array.from({ length: 5 }, (_, i) => tour({ id: `tour-${i}` }))
    const merged = mergeAdminUnsubmittedListItems(tours, [])
    const page1 = paginateSortedAdminSettlementRows(merged, { page: 1, pageSize: 1 }).total
    const pageLarge = paginateSortedAdminSettlementRows(merged, { page: 1, pageSize: 100 }).total
    expect(page1).toBe(5)
    expect(pageLarge).toBe(5)
    expect(computeAdminUnsubmittedTotalFromRows(tours, [])).toBe(5)
  })

  it('preserves search semantics via merge path', () => {
    const tours = [tour({ id: 'tour-a', tour_code: 'FIND-ME' }), tour({ id: 'tour-b', tour_code: 'OTHER' })]
    expect(computeAdminUnsubmittedTotalFromRows(tours, [], 'FIND-ME')).toBe(1)
    expect(legacyUnsubmittedTotal(tours, [], 'FIND-ME')).toBe(1)
  })

  it('count-only path matches merge for minimal settlement rows', () => {
    const tours = [tour({ id: 'tour-a' }), tour({ id: 'tour-b' })]
    const settlements = [{ status: 'draft', tour: { id: 'tour-b' } }]
    expect(countAdminUnsubmittedWithoutSearch(tours, settlements)).toBe(2)
    expect(computeAdminUnsubmittedTotal(tours, settlements as unknown as AdminSettlementListItem[])).toBe(
      2,
    )
  })

  it('count-only path accepts id-only tour rows', () => {
    const tours = [{ id: 'tour-a' }, { id: 'tour-b' }]
    const settlements = [{ status: 'draft', tour: { id: 'tour-b' } }]
    expect(countAdminUnsubmittedWithoutSearch(tours, settlements)).toBe(2)
    expect(computeAdminUnsubmittedTotalFromRows(tours as AdminUnsubmittedTourRow[], settlements)).toBe(
      2,
    )
  })
})

describe('getAdminUnsubmittedCount randomized parity', () => {
  const statuses = ['draft', 'submitted', 'edit_requested', 'paid', 'pending_guide_confirmation'] as const

  function mulberry32(seed: number) {
    return () => {
      seed |= 0
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  for (const seed of [1, 7, 42, 99, 1234, 5678, 9012, 31415]) {
    it(`old total === new count for seed ${seed}`, () => {
      const rand = mulberry32(seed)
      const tourCount = 1 + Math.floor(rand() * 8)
      const tours = Array.from({ length: tourCount }, (_, i) =>
        tour({
          id: `tour-${seed}-${i}`,
          branch_id: rand() > 0.5 ? 'danang' : 'hanoi',
          branch: rand() > 0.5 ? branchDanang : branchHanoi,
        }),
      )
      const settlements = tours.flatMap((row, index) => {
        const roll = rand()
        if (roll < 0.45) return []
        const status = statuses[Math.floor(rand() * statuses.length)]
        return [
          settlement({
            id: `settlement-${seed}-${index}`,
            status,
            tourId: row.id,
            branch_id: row.branch_id,
          }),
        ]
      })

      const newCount = computeAdminUnsubmittedTotalFromRows(tours, settlements)
      const oldTotal = legacyUnsubmittedTotal(tours, settlements)
      expect(newCount).toBe(oldTotal)
    })
  }
})
