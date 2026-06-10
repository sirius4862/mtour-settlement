import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ACTIONS_SRC = readFileSync('src/lib/actions/settlementActions.ts', 'utf8')

function getAdminSettlementsBody(): string {
  const start = ACTIONS_SRC.indexOf('export async function getAdminSettlements')
  const end = ACTIONS_SRC.indexOf('export async function getAdminActionQueue', start)
  return ACTIONS_SRC.slice(start, end)
}

describe('getAdminSettlements — tours date pre-query branch scope', () => {
  const body = getAdminSettlementsBody()

  it('resolves region before the tours date pre-query', () => {
    const regionIdx = body.indexOf('resolveSettlementRegionFilter')
    const tourQueryIdx = body.indexOf('let tourDateQuery = supabase')
    expect(regionIdx).toBeGreaterThan(-1)
    expect(tourQueryIdx).toBeGreaterThan(regionIdx)
  })

  it('applies branch_id to tours pre-query when regionId is resolved', () => {
    const tourBlockStart = body.indexOf('let tourDateQuery = supabase')
    const tourBlockEnd = body.indexOf('} else if (filters?.yearMonth)', tourBlockStart)
    const tourBlock = body.slice(tourBlockStart, tourBlockEnd)
    expect(tourBlock).toContain("if (regionId) tourDateQuery = tourDateQuery.eq('branch_id', regionId)")
    const branchIdx = tourBlock.indexOf("eq('branch_id', regionId)")
    const gteIdx = tourBlock.indexOf("gte('start_date', filters.startDate)")
    const lteIdx = tourBlock.indexOf("lte('start_date', filters.endDate)")
    expect(branchIdx).toBeGreaterThan(gteIdx)
    expect(branchIdx).toBeGreaterThan(lteIdx)
  })

  it('does not unconditionally branch-scope tours pre-query (master all-region path)', () => {
    const tourBlockStart = body.indexOf('let tourDateQuery = supabase')
    const tourBlockEnd = body.indexOf('} else if (filters?.yearMonth)', tourBlockStart)
    const tourBlock = body.slice(tourBlockStart, tourBlockEnd)
    expect(tourBlock).not.toMatch(
      /let tourDateQuery[\s\S]*?\.eq\('branch_id', regionId\)[\s\S]*?\.gte\('start_date'/,
    )
  })

  it('still returns empty when tours pre-query yields zero IDs', () => {
    expect(body).toContain('if (tourIdsInRange.length === 0)')
    expect(body).toContain('return { items: [], total: 0, page, pageSize, totalPages: 0 }')
  })

  it('keeps settlements branch filter separate from tours pre-query', () => {
    const settlementsBranchIdx = body.indexOf("if (regionId) q = q.eq('branch_id', regionId)")
    const tourQueryIdx = body.indexOf('let tourDateQuery = supabase')
    expect(settlementsBranchIdx).toBeGreaterThan(-1)
    expect(tourQueryIdx).toBeGreaterThan(settlementsBranchIdx)
  })

  it('uses shared in-memory pagination helper and defers DB .range()', () => {
    expect(body).toContain('paginateSortedAdminSettlementRows')
    expect(body).not.toContain('sortAdminSettlementsByTourDate')
    expect(body).not.toContain('.slice(from, to + 1)')
    expect(body).not.toContain('.range(from, to)')
    expect(body).toContain('resolveAdminSettlementSearchScope')
    expect(body).toContain("buildAdminSettlementSearchOrFilter(scope, 'settlements')")
    expect(body).not.toMatch(
      /getAdminSettlements[\s\S]*?pattern\.ilike\.\$\{pattern\},tour_code\.ilike/,
    )
  })
})

describe('getAdminSettlements — settlement workflow separation', () => {
  const body = getAdminSettlementsBody()

  it('does not call settlement submit RPC or calc/payout helpers', () => {
    expect(body).not.toMatch(/\.rpc\(/)
    expect(body).not.toContain('guide_submit_settlement')
    expect(body).not.toContain('guide_confirm_settlement')
    expect(body).not.toContain('@/lib/settlement/calc')
    expect(body).not.toContain('paid_at')
    expect(body).not.toContain('guide_confirmed_at')
  })
})

describe('getAdminSettlements — 미제출 (draft) includes tours without settlements', () => {
  const actions = readFileSync('src/lib/actions/settlementActions.ts', 'utf8')

  it('delegates draft filter to getAdminUnsubmittedSettlements even without a date range', () => {
    const start = actions.indexOf('export async function getAdminSettlements')
    const body = actions.slice(start, start + 1200)
    expect(body).toContain('isAdminUnsubmittedOnlyStatusFilter(filters?.status)')
    expect(body).not.toContain('filters?.startDate &&\n    filters?.endDate')
    expect(body).toContain('getAdminUnsubmittedSettlements(supabase, filters ?? {}, page, pageSize, regionId)')
  })

  it('paginates unsubmitted merge results via shared helper', () => {
    const start = actions.indexOf('async function getAdminUnsubmittedSettlements')
    const end = actions.indexOf('export async function getAdminSettlements', start)
    const body = actions.slice(start, end)
    expect(body).toContain('paginateSortedAdminSettlementRows(merged, { page, pageSize })')
    expect(body).not.toContain('.slice(from, to + 1)')
  })

  it('keeps settlement-only query for non-draft status filters', () => {
    const body = getAdminSettlementsBody()
    expect(body).toContain(".from('settlements')")
    expect(body).toContain('expandWorkflowStatusFilter(filters.status)')
  })

  it('keeps unsubmitted backlog loader period-independent', () => {
    const start = actions.indexOf('async function getAdminUnsubmittedSettlements')
    const end = actions.indexOf('export async function getAdminSettlements', start)
    const body = actions.slice(start, end)

    expect(body).not.toContain('if (filters.startDate && filters.endDate)')
    expect(body).not.toContain(".gte('start_date', filters.startDate)")
  })

  it('skips settlement date pre-query for active backlog status filters', () => {
    const body = getAdminSettlementsBody()
    expect(body).toContain('shouldApplyAdminSettlementDateFilter(filters)')
    expect(body).toMatch(
      /if\s*\([\s\S]*?filters\?\.startDate[\s\S]*?filters\?\.endDate[\s\S]*?shouldApplyAdminSettlementDateFilter\(filters\)/,
    )
  })
})

describe('getAdminDashboardStats — period-independent 미제출 backlog', () => {
  const actions = readFileSync('src/lib/actions/settlementActions.ts', 'utf8')
  const start = actions.indexOf('export async function getAdminDashboardStats')
  const end = actions.indexOf('// ── 정산서 생성', start)
  const body = actions.slice(start, end)

  it('replaces the draft card count with the unsubmitted backlog total', () => {
    expect(body).toContain('getAdminUnsubmittedSettlements(')
    expect(body).toContain("row.status === 'draft' ? { ...row, count: unsubmitted.total } : row")
  })

  it('does not pass dashboard yearMonth/date filters to the unsubmitted backlog count', () => {
    const callStart = body.indexOf('const unsubmitted = await getAdminUnsubmittedSettlements')
    const callEnd = body.indexOf('return stats.map', callStart)
    const callBlock = body.slice(callStart, callEnd)

    expect(callBlock).toContain('{ regionId: filters?.regionId }')
    expect(callBlock).not.toContain('yearMonth')
    expect(callBlock).not.toContain('startDate')
    expect(callBlock).not.toContain('endDate')
  })

  it('keeps region scope shared with dashboard stats and backlog count', () => {
    expect(body).toContain('const regionId = await resolveSettlementRegionFilter(filters)')
    expect(body).toContain('if (regionId) q = q.eq(\'branch_id\', regionId)')
    expect(body).toContain('regionId,')
  })
})

describe('getAdminSettlements — shared admin search helper', () => {
  const actions = readFileSync('src/lib/actions/settlementActions.ts', 'utf8')

  it('uses resolveAdminSettlementSearchScope in unsubmitted and settlement list paths', () => {
    const unsubmittedStart = actions.indexOf('async function getAdminUnsubmittedSettlements')
    const unsubmittedEnd = actions.indexOf('export async function getAdminSettlements', unsubmittedStart)
    const unsubmittedBody = actions.slice(unsubmittedStart, unsubmittedEnd)
    const settlementsBody = getAdminSettlementsBody()

    expect(unsubmittedBody).toContain('resolveAdminSettlementSearchScope(supabase, search)')
    expect(unsubmittedBody).toContain("buildAdminSettlementSearchOrFilter(scope, 'tours')")
    expect(settlementsBody).toContain('resolveAdminSettlementSearchScope(supabase, search)')
    expect(settlementsBody).toContain("buildAdminSettlementSearchOrFilter(scope, 'settlements')")
  })
})

describe('getAdminSettlements — dashboard view=all progress filter', () => {
  const body = getAdminSettlementsBody()

  it('applies expandAdminDashboardProgressStatuses before search and fetch', () => {
    const statusIdx = body.indexOf('if (filters?.status)')
    const progressIdx = body.indexOf('filters?.dashboardProgressOnly')
    const searchIdx = body.indexOf('const search = filters?.search?.trim()')
    const fetchIdx = body.indexOf('const { data, count, error } = await q')

    expect(progressIdx).toBeGreaterThan(statusIdx)
    expect(progressIdx).toBeLessThan(searchIdx)
    expect(searchIdx).toBeLessThan(fetchIdx)
    expect(body).toContain('expandAdminDashboardProgressStatuses()')
    expect(body).toContain("q.in('status', [...statuses])")
  })

  it('does not post-filter dashboard rows in admin page', () => {
    const page = readFileSync('src/app/admin/page.tsx', 'utf8')
    expect(page).toContain('dashboardProgressOnly')
    expect(page).not.toContain('isAdminDashboardProgressStatus')
  })
})
