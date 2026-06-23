import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAdminRegionFilter } from '@/lib/region/permissions'

const ROOT = process.cwd()
const SETTLEMENT_ACTIONS = readFileSync(
  join(ROOT, 'src/lib/actions/settlementActions.ts'),
  'utf8',
)
const TOUR_ACTIONS = readFileSync(join(ROOT, 'src/lib/actions/tourActions.ts'), 'utf8')
const ADMIN_PAGE = readFileSync(join(ROOT, 'src/app/admin/page.tsx'), 'utf8')

describe('admin dashboard profile dedupe', () => {
  it('getProfile routes through cached getSession instead of duplicate auth.getUser', () => {
    const start = SETTLEMENT_ACTIONS.indexOf('async function getProfile()')
    const end = SETTLEMENT_ACTIONS.indexOf('async function getAdminRegionScope', start)
    const body = SETTLEMENT_ACTIONS.slice(start, end)

    expect(body).toContain('getSession()')
    expect(body).not.toContain('auth.getUser()')
    expect(body).not.toContain(".from('profiles')")
  })

  it('getAdminRegionScope still gates admin tier before region resolution', () => {
    const start = SETTLEMENT_ACTIONS.indexOf('async function getAdminRegionScope')
    const end = SETTLEMENT_ACTIONS.indexOf('async function resolveSettlementRegionFilter', start)
    const body = SETTLEMENT_ACTIONS.slice(start, end)

    expect(body).toContain('getProfile()')
    expect(body).toContain('isAdminTier(profile.role)')
  })

  it('requireAdminProfile routes through cached getSession', () => {
    const start = TOUR_ACTIONS.indexOf('async function requireAdminProfile()')
    const end = TOUR_ACTIONS.indexOf('function adminRegionScope', start)
    const body = TOUR_ACTIONS.slice(start, end)

    expect(body).toContain('getSession()')
    expect(body).not.toContain('auth.getUser()')
    expect(body).not.toContain(".from('profiles')")
    expect(body).toContain('isAdminTier(session.role)')
  })

  it('getBranches keeps MTour branch filter and regional scope unchanged', () => {
    const start = TOUR_ACTIONS.indexOf('export async function getBranches')
    const end = TOUR_ACTIONS.indexOf('export async function getGuideProfiles', start)
    const body = TOUR_ACTIONS.slice(start, end)

    expect(body).toContain('requireAdminProfile()')
    expect(body).toContain('filterMtourRegionBranches')
    expect(body).toContain('isMasterAdmin(scope.role)')
    expect(body).toContain('scope.assignedRegionId')
  })

  it('admin dashboard page still uses requireAdmin and getBranches', () => {
    expect(ADMIN_PAGE).toContain('requireAdmin()')
    expect(ADMIN_PAGE).toContain('getBranches()')
    expect(ADMIN_PAGE).toContain('getAdminDashboardStats')
  })
})

describe('admin dashboard region scope parity', () => {
  it('master admin unbounded scope is unchanged', () => {
    expect(
      resolveAdminRegionFilter(
        { role: 'master_admin', assignedRegionId: null },
        undefined,
      ),
    ).toBeUndefined()
  })

  it('regional admin forced scope is unchanged', () => {
    expect(
      resolveAdminRegionFilter(
        { role: 'admin', assignedRegionId: 'danang' },
        'hanoi',
      ),
    ).toBe('danang')
  })

  it('getAdminRegionScope rejects non-admin roles before region resolution', () => {
    const start = SETTLEMENT_ACTIONS.indexOf('async function getAdminRegionScope')
    const end = SETTLEMENT_ACTIONS.indexOf('async function resolveSettlementRegionFilter', start)
    const body = SETTLEMENT_ACTIONS.slice(start, end)

    expect(body).toContain('isAdminTier(profile.role)')
  })
})
