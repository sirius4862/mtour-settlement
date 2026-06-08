import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  canAccessAdminRoutes,
  canAccessGuideRoutes,
  canAccessVehicleRoutes,
  isAdminTier,
} from '@/lib/auth/permissions'
import {
  canChangeVehicleAssignment,
  deriveVehicleAssignmentStatus,
  VEHICLE_ASSIGNMENT_LOCKED_MESSAGE,
  vehicleAssignmentStatusLabel,
} from './assignment-status'

const ADMIN_ACTIONS_SRC = readFileSync('src/lib/actions/vehicleCompanyAdminActions.ts', 'utf8')
const ASSIGN_TABLE_SRC = readFileSync('src/app/admin/vehicle-assignments/VehicleAssignmentTable.tsx', 'utf8')
const ASSIGN_PAGE_SRC = readFileSync('src/app/admin/vehicle-assignments/page.tsx', 'utf8')
const ASSIGN_FILTER_SRC = readFileSync(
  'src/app/admin/vehicle-assignments/VehicleAssignmentDateFilter.tsx',
  'utf8',
)
const V2_SQL = readFileSync('supabase/vehicle_company_v2_profile_assignment.sql', 'utf8')

describe('vehicle assignment status (pure)', () => {
  it('derives status from assignment + report state', () => {
    expect(deriveVehicleAssignmentStatus(false, 'none')).toBe('unassigned')
    expect(deriveVehicleAssignmentStatus(true, 'none')).toBe('assigned')
    expect(deriveVehicleAssignmentStatus(true, 'draft')).toBe('draft')
    expect(deriveVehicleAssignmentStatus(true, 'submitted')).toBe('submitted')
    expect(deriveVehicleAssignmentStatus(false, 'submitted')).toBe('unassigned')
  })

  it('labels match the simplified admin status set', () => {
    expect(vehicleAssignmentStatusLabel('unassigned')).toBe('배정 안됨')
    expect(vehicleAssignmentStatusLabel('assigned')).toBe('배정됨')
    expect(vehicleAssignmentStatusLabel('draft')).toBe('작성중')
    expect(vehicleAssignmentStatusLabel('submitted')).toBe('제출완료')
  })

  it('allows manual change only when no report exists', () => {
    expect(canChangeVehicleAssignment('none')).toBe(true)
    expect(canChangeVehicleAssignment('draft')).toBe(false)
    expect(canChangeVehicleAssignment('submitted')).toBe(false)
  })
})

describe('admin vehicle actions — settlement separation (source-level)', () => {
  it('never queries settlements or financial tables', () => {
    expect(ADMIN_ACTIONS_SRC).not.toMatch(/from\(['"]settlements['"]\)/)
    expect(ADMIN_ACTIONS_SRC).not.toMatch(/from\(['"]settlement_/)
    expect(ADMIN_ACTIONS_SRC).not.toMatch(/company_expense/)
  })

  it('adds no settlement submit RPC and no calc/payout/status imports', () => {
    expect(ADMIN_ACTIONS_SRC).not.toMatch(/\.rpc\(/)
    expect(ADMIN_ACTIONS_SRC).not.toContain('@/lib/settlement/calc')
    expect(ADMIN_ACTIONS_SRC).not.toContain('@/lib/settlement/status')
    expect(ADMIN_ACTIONS_SRC).not.toContain('status-guards')
    expect(ADMIN_ACTIONS_SRC).not.toContain('settlementActions')
  })
})

describe('admin vehicle actions — profile-based assignment (source-level)', () => {
  it('loads assignable accounts from profiles (not vehicle_companies)', () => {
    expect(ADMIN_ACTIONS_SRC).toContain('getAssignableVehicleCompanyProfiles')
    expect(ADMIN_ACTIONS_SRC).toMatch(/\.from\(['"]profiles['"]\)/)
    expect(ADMIN_ACTIONS_SRC).toContain(".eq('role', 'vehicle_company')")
    expect(ADMIN_ACTIONS_SRC).toContain(".eq('is_active', true)")
    expect(ADMIN_ACTIONS_SRC).not.toMatch(/from\(['"]vehicle_companies['"]\)/)
    expect(ADMIN_ACTIONS_SRC).not.toMatch(/from\(['"]vehicle_company_users['"]\)/)
  })

  it('does not expose registry or account-linking actions', () => {
    expect(ADMIN_ACTIONS_SRC).not.toContain('createVehicleCompany')
    expect(ADMIN_ACTIONS_SRC).not.toContain('updateVehicleCompany')
    expect(ADMIN_ACTIONS_SRC).not.toContain('getAdminVehicleCompanies')
    expect(ADMIN_ACTIONS_SRC).not.toContain('linkVehicleCompanyUser')
    expect(ADMIN_ACTIONS_SRC).not.toContain('getAvailableVehicleCompanyProfiles')
  })

  it('assigns by updating tours.vehicle_company_profile_id only', () => {
    expect(ADMIN_ACTIONS_SRC).toMatch(
      /\.from\(['"]tours['"]\)\s*\n?\s*\.update\(\{ vehicle_company_profile_id/,
    )
    expect(ADMIN_ACTIONS_SRC).not.toMatch(/\.update\(\{ vehicle_company_id/)
  })

  it('rejects non-vehicle_company profiles', () => {
    expect(ADMIN_ACTIONS_SRC).toContain('isVehicleCompany(profile.role')
    expect(ADMIN_ACTIONS_SRC).toContain('차량회사 권한 계정만 배정할 수 있습니다.')
  })

  it('rejects inactive profiles', () => {
    expect(ADMIN_ACTIONS_SRC).toContain('비활성 차량회사 계정은 배정할 수 없습니다.')
    expect(ADMIN_ACTIONS_SRC).toContain('!profile.is_active')
  })

  it('rejects branch mismatch between profile and tour', () => {
    expect(ADMIN_ACTIONS_SRC).toContain('차량회사와 투어의 지역이 일치해야 합니다.')
    expect(ADMIN_ACTIONS_SRC).toContain('profile.branch_id')
    expect(ADMIN_ACTIONS_SRC).toContain('tour.branch_id')
  })

  it('blocks manual assign/clear when a vehicle report exists', () => {
    expect(ADMIN_ACTIONS_SRC).toContain('reportExistsForTour')
    expect(ADMIN_ACTIONS_SRC).toContain('VEHICLE_ASSIGNMENT_LOCKED_MESSAGE')
    expect(VEHICLE_ASSIGNMENT_LOCKED_MESSAGE).toContain('배정회수')
  })

  it('uses region scoping helper for branch access', () => {
    expect(ADMIN_ACTIONS_SRC).toContain('assertAdminCanAccessSettlementBranch')
    expect(ADMIN_ACTIONS_SRC).toContain('filterVehicleAssignmentToursByScope')
  })
})

function vehicleAssignmentListFnBody(): string {
  const start = ADMIN_ACTIONS_SRC.indexOf('export async function getAdminVehicleAssignmentTours')
  const end = ADMIN_ACTIONS_SRC.indexOf('async function reportExistsForTour', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return ADMIN_ACTIONS_SRC.slice(start, end)
}

describe('admin vehicle assignment list query (source-level)', () => {
  it('lists from tours only — reports are optional enrichment', () => {
    const body = vehicleAssignmentListFnBody()
    expect(ADMIN_ACTIONS_SRC).toContain('buildVehicleAssignmentTourListItems')
    expect(body).toMatch(/\.from\(['"]tours['"]\)/)
    expect(body).toMatch(/\.from\(['"]vehicle_route_reports['"]\)/)
    expect(body).toMatch(/\.in\('tour_id', tourIds\)/)
    expect(body.indexOf('.from(\'tours\')')).toBeLessThan(body.indexOf('.from(\'vehicle_route_reports\')'))
  })

  it('does not require vehicle_company_profile_id or a vehicle report', () => {
    expect(ADMIN_ACTIONS_SRC).not.toMatch(/vehicle_company_profile_id['"]\s*,\s*null/)
    expect(ADMIN_ACTIONS_SRC).not.toContain('.not.is(')
    expect(ADMIN_ACTIONS_SRC).not.toMatch(/vehicle_company_id/)
    expect(ADMIN_ACTIONS_SRC).not.toMatch(/inner.*vehicle_route_reports/i)
  })

  it('does not query settlements', () => {
    expect(ADMIN_ACTIONS_SRC).not.toMatch(/from\(['"]settlements['"]\)/)
  })

  it('applies branch_id in the tours query for scoped admins', () => {
    expect(ADMIN_ACTIONS_SRC).toContain("tourQuery.eq('branch_id', ctx.branch_id)")
    expect(ADMIN_ACTIONS_SRC).toContain('isMasterAdmin(ctx.role)')
  })

  it('orders recent tours first within the branch-scoped limit', () => {
    expect(ADMIN_ACTIONS_SRC).toMatch(/\.order\('start_date',\s*\{\s*ascending:\s*false\s*\}\)/)
    expect(ADMIN_ACTIONS_SRC).toMatch(/\.order\('created_at',\s*\{\s*ascending:\s*false\s*\}\)/)
  })

  it('applies date range in DB after branch filter and before limit', () => {
    const body = vehicleAssignmentListFnBody()
    expect(body).toContain('VehicleAssignmentDateFilter')
    expect(body).toContain("filter.range !== 'all'")
    expect(body).toMatch(/if \(filter\.from\) tourQuery = tourQuery\.gte\('start_date', filter\.from\)/)
    expect(body).toMatch(/if \(filter\.to\) tourQuery = tourQuery\.lte\('start_date', filter\.to\)/)
    const branchIdx = body.indexOf("tourQuery.eq('branch_id'")
    const gteIdx = body.indexOf("filter.from) tourQuery")
    const limitIdx = body.indexOf('.limit(listLimit)')
    const orderIdx = body.indexOf(".order('start_date'")
    expect(branchIdx).toBeGreaterThan(-1)
    expect(gteIdx).toBeGreaterThan(branchIdx)
    expect(orderIdx).toBeGreaterThan(gteIdx)
    expect(limitIdx).toBeGreaterThan(orderIdx)
  })

  it('excludes recalled guide assignments only', () => {
    expect(ADMIN_ACTIONS_SRC).toContain(".eq('assignment_status', 'assigned')")
  })
})

describe('admin vehicle assignment UI (source-level)', () => {
  it('assignment page is protected by requireAdmin and loads profiles', () => {
    expect(ASSIGN_PAGE_SRC).toContain('requireAdmin')
    expect(ASSIGN_PAGE_SRC).toContain('getAssignableVehicleCompanyProfiles')
    expect(ASSIGN_PAGE_SRC).not.toContain('getAdminVehicleCompanies')
    expect(ASSIGN_PAGE_SRC).not.toContain('vehicle-companies')
  })

  it('uses searchParams for shareable date filters without delete/archive controls', () => {
    expect(ASSIGN_PAGE_SRC).toContain('searchParams')
    expect(ASSIGN_PAGE_SRC).toContain('parseVehicleAssignmentSearchParams')
    expect(ASSIGN_PAGE_SRC).toContain('getAdminVehicleAssignmentTours(dateFilter)')
    expect(ASSIGN_PAGE_SRC).toContain('VehicleAssignmentDateFilterBar')
    expect(ASSIGN_PAGE_SRC).not.toMatch(/delete|archive|삭제/i)
  })

  it('date filter bar exposes quick ranges, custom apply, and notices', () => {
    expect(ASSIGN_FILTER_SRC).toContain('오늘 이후')
    expect(ASSIGN_FILTER_SRC).toContain('이번 달')
    expect(ASSIGN_FILTER_SRC).toContain('다음 달')
    expect(ASSIGN_FILTER_SRC).toContain('지난 달')
    expect(ASSIGN_FILTER_SRC).toContain('전체')
    expect(ASSIGN_FILTER_SRC).toContain('조회')
    expect(ASSIGN_FILTER_SRC).toContain('VEHICLE_ASSIGNMENT_CURRENT_MONTH_NOTICE')
    expect(ASSIGN_FILTER_SRC).toContain('VEHICLE_ASSIGNMENT_ALL_RANGE_WARNING')
    expect(ASSIGN_FILTER_SRC).toContain('vehicleAssignmentQuickRangeUrls')
    expect(ASSIGN_FILTER_SRC).toContain('href={quick.all}')
    expect(ASSIGN_FILTER_SRC).not.toMatch(/delete|archive|삭제/i)
  })

  it('assignment table uses profile id as dropdown value', () => {
    expect(ASSIGN_TABLE_SRC).toContain('vehicle_company_profile_id')
    expect(ASSIGN_TABLE_SRC).toContain('korean_name || p.full_name || p.email')
    expect(ASSIGN_TABLE_SRC).not.toContain('vehicle_companies')
  })
})

describe('DB v2 profile assignment migration (source-level)', () => {
  it('adds profile columns, backfill, RLS, and recall cleanup', () => {
    expect(V2_SQL).toContain('vehicle_company_profile_id')
    expect(V2_SQL).toContain('idx_tours_vehicle_company_profile_id')
    expect(V2_SQL).toContain('idx_vehicle_route_reports_vehicle_company_profile_id')
    expect(V2_SQL).toContain('vehicle_company_users vcu')
    expect(V2_SQL).toContain('vehicle_company_profile_id = auth.uid()')
    expect(V2_SQL).toContain('vehicle_company_profile_id = NULL')
  })

  it('keeps legacy tables/columns for rollback', () => {
    expect(V2_SQL).not.toMatch(/DROP TABLE.*vehicle_companies/i)
    expect(V2_SQL).not.toMatch(/DROP TABLE.*vehicle_company_users/i)
    expect(V2_SQL).not.toMatch(/DROP COLUMN.*vehicle_company_id/i)
  })
})

describe('roles unchanged', () => {
  it('vehicle_company stays out of admin/guide tiers', () => {
    expect(canAccessVehicleRoutes('vehicle_company')).toBe(true)
    expect(isAdminTier('vehicle_company')).toBe(false)
    expect(canAccessGuideRoutes('vehicle_company')).toBe(false)
    expect(canAccessAdminRoutes('vehicle_company')).toBe(false)
  })
})
