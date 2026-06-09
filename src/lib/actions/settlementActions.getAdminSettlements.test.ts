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

  it('does not change in-memory sort, slice pagination, or search paths', () => {
    expect(body).toContain('sortAdminSettlementsByTourDate')
    expect(body).toContain('.slice(from, to + 1)')
    expect(body).toContain('escapeIlikePattern(search)')
    expect(body).not.toContain('.range(from, to)')
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
