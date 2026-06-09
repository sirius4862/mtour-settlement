import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AdminSettlementListItem } from './settlement-list'
import {
  ADMIN_UNSUBMITTED_TOUR_ITEM_ID_PREFIX,
  buildAdminUnsubmittedTourListItem,
  isAdminUnsubmittedOnlyStatusFilter,
  isAdminUnsubmittedTourListItemId,
  mergeAdminUnsubmittedListItems,
  settlementStatusAllowsUnsubmittedList,
} from './settlement-unsubmitted-list'

const tour = {
  id: 'tour-1',
  pattern: 'APR Test Tour',
  tour_code: 'APR26-01',
  start_date: '2026-04-15',
  pax_count: 18,
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
  branch: { id: 'danang', name: 'Da Nang', code: 'DANANG' },
}

const draftSettlement: AdminSettlementListItem = {
  id: 'settlement-draft',
  status: 'draft',
  year_month: '2026-04',
  updated_at: '2026-04-10T00:00:00Z',
  submitted_at: null,
  guide_confirmed_at: null,
  branch_id: 'danang',
  calc_summary_json: null,
  tour: {
    id: 'tour-2',
    pattern: 'Draft Tour',
    tour_code: 'APR26-02',
    start_date: '2026-04-20',
    pax_count: 12,
  },
  guide: tour.guide,
  branch: tour.branch,
}

const submittedSettlement: AdminSettlementListItem = {
  ...draftSettlement,
  id: 'settlement-submitted',
  status: 'submitted',
  tour: { ...draftSettlement.tour!, id: 'tour-3', tour_code: 'APR26-03' },
}

describe('isAdminUnsubmittedOnlyStatusFilter', () => {
  it('is true only for draft (미제출)', () => {
    expect(isAdminUnsubmittedOnlyStatusFilter('draft')).toBe(true)
    expect(isAdminUnsubmittedOnlyStatusFilter('submitted')).toBe(false)
    expect(isAdminUnsubmittedOnlyStatusFilter('paid')).toBe(false)
    expect(isAdminUnsubmittedOnlyStatusFilter(undefined)).toBe(false)
  })
})

describe('mergeAdminUnsubmittedListItems', () => {
  it('includes assigned tours with no settlement row', () => {
    const merged = mergeAdminUnsubmittedListItems([tour], [])
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe(`${ADMIN_UNSUBMITTED_TOUR_ITEM_ID_PREFIX}tour-1`)
    expect(merged[0].status).toBe('draft')
  })

  it('includes existing draft settlement rows', () => {
    const merged = mergeAdminUnsubmittedListItems(
      [{ ...tour, id: 'tour-2' }],
      [draftSettlement],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('settlement-draft')
  })

  it('excludes tours that already have a non-draft settlement', () => {
    const merged = mergeAdminUnsubmittedListItems(
      [{ ...tour, id: 'tour-3' }],
      [submittedSettlement],
    )
    expect(merged).toHaveLength(0)
  })

  it('filters by search on tour-only rows', () => {
    const merged = mergeAdminUnsubmittedListItems([tour], [], 'APR26-01')
    expect(merged).toHaveLength(1)
    expect(mergeAdminUnsubmittedListItems([tour], [], 'missing')).toHaveLength(0)
  })

  it('sorts by tour start_date', () => {
    const merged = mergeAdminUnsubmittedListItems(
      [
        { ...tour, id: 'tour-late', start_date: '2026-04-30', tour_code: 'B' },
        { ...tour, id: 'tour-early', start_date: '2026-04-01', tour_code: 'A' },
      ],
      [],
    )
    expect(merged.map((r) => r.tour?.start_date)).toEqual(['2026-04-01', '2026-04-30'])
  })
})

describe('buildAdminUnsubmittedTourListItem', () => {
  it('uses synthetic id and draft status for display', () => {
    const item = buildAdminUnsubmittedTourListItem(tour)
    expect(isAdminUnsubmittedTourListItemId(item.id)).toBe(true)
    expect(item.status).toBe('draft')
    expect(item.calc_summary_json).toBeNull()
  })
})

describe('settlementStatusAllowsUnsubmittedList', () => {
  it('allows null and draft only', () => {
    expect(settlementStatusAllowsUnsubmittedList(null)).toBe(true)
    expect(settlementStatusAllowsUnsubmittedList('draft')).toBe(true)
    expect(settlementStatusAllowsUnsubmittedList('submitted')).toBe(false)
  })
})

describe('getAdminSettlements unsubmitted path (source-level)', () => {
  const actions = readFileSync(join(process.cwd(), 'src/lib/actions/settlementActions.ts'), 'utf8')

  it('branches to tour-based 미제출 loader for draft + date range', () => {
    expect(actions).toContain('getAdminUnsubmittedSettlements')
    expect(actions).toContain('isAdminUnsubmittedOnlyStatusFilter(filters?.status)')
    expect(actions).toContain('mergeAdminUnsubmittedListItems')
  })

  it('queries assigned non-recalled tours by start_date', () => {
    const start = actions.indexOf('async function getAdminUnsubmittedSettlements')
    const end = actions.indexOf('export async function getAdminSettlements', start)
    const body = actions.slice(start, end)
    expect(body).toContain(".not('guide_id', 'is', null)")
    expect(body).toContain(".neq('assignment_status', 'recalled')")
    expect(body).toContain(".gte('start_date', startDate)")
    expect(body).toContain(".lte('start_date', endDate)")
    expect(body).not.toContain('.insert(')
  })

  it('applies branch_id to tour query when region is resolved', () => {
    const start = actions.indexOf('async function getAdminUnsubmittedSettlements')
    const end = actions.indexOf('export async function getAdminSettlements', start)
    const body = actions.slice(start, end)
    expect(body).toContain("if (regionId) tourQuery = tourQuery.eq('branch_id', regionId)")
  })
})

describe('AdminSettlementTable unsubmitted tour rows (source-level)', () => {
  const table = readFileSync(
    join(process.cwd(), 'src/components/admin/AdminSettlementTable.tsx'),
    'utf8',
  )

  it('shows 정산서 미작성 instead of settlement detail links for tour-only rows', () => {
    expect(table).toContain('isAdminUnsubmittedTourListItemId')
    expect(table).toContain('정산서 미작성')
    expect(table).toMatch(/tourOnly[\s\S]*?정산서 미작성/)
  })
})
