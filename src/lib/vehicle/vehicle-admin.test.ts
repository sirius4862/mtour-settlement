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
const COMPANIES_PAGE_SRC = readFileSync('src/app/admin/vehicle-companies/page.tsx', 'utf8')
const STEP2_SQL = readFileSync('supabase/vehicle_company_v1_step2_schema.sql', 'utf8')

describe('vehicle assignment status (pure)', () => {
  it('derives status from assignment + report state', () => {
    expect(deriveVehicleAssignmentStatus(false, 'none')).toBe('unassigned')
    expect(deriveVehicleAssignmentStatus(true, 'none')).toBe('assigned')
    expect(deriveVehicleAssignmentStatus(true, 'draft')).toBe('draft')
    expect(deriveVehicleAssignmentStatus(true, 'submitted')).toBe('submitted')
    // A report implies a company even if the flag lagged.
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

  it('selects no settlement money fields', () => {
    for (const financial of [
      'ground_fee', 'guide_daily_fee', 'settlement_ratio', 'tip_received',
      'option_credit', 'vehicle_fee_usd', 'calc_summary', 'guide_payout',
    ]) {
      expect(ADMIN_ACTIONS_SRC).not.toContain(financial)
    }
  })
})

describe('admin vehicle actions — scoping & rules (source-level)', () => {
  it('uses region scoping helper for branch access', () => {
    expect(ADMIN_ACTIONS_SRC).toContain('assertAdminCanAccessSettlementBranch')
    expect(ADMIN_ACTIONS_SRC).toContain('filterAdminToursByRegionScope')
  })

  it('master_admin sees all companies; plain admin is branch-scoped', () => {
    expect(ADMIN_ACTIONS_SRC).toContain('isMasterAdmin(ctx.role)')
    expect(ADMIN_ACTIONS_SRC).toMatch(/c\.branch_id === ctx\.branch_id/)
  })

  it('enforces app-layer branch match on assignment', () => {
    expect(ADMIN_ACTIONS_SRC).toContain('차량회사와 투어의 지역이 일치해야 합니다.')
    expect(ADMIN_ACTIONS_SRC).toContain('company.branch_id')
    expect(ADMIN_ACTIONS_SRC).toContain('tour.branch_id')
  })

  it('limits profile linking to vehicle_company role and one company per profile', () => {
    expect(ADMIN_ACTIONS_SRC).toContain('isVehicleCompany(profile.role')
    expect(ADMIN_ACTIONS_SRC).toContain('차량회사 권한 계정만 연결할 수 있습니다.')
    expect(ADMIN_ACTIONS_SRC).toContain("onConflict: 'profile_id'")
  })

  it('blocks manual assign/clear when a vehicle report exists', () => {
    expect(ADMIN_ACTIONS_SRC).toContain('reportExistsForTour')
    expect(ADMIN_ACTIONS_SRC).toContain('VEHICLE_ASSIGNMENT_LOCKED_MESSAGE')
    // The locked message itself is defined in the pure helper.
    expect(VEHICLE_ASSIGNMENT_LOCKED_MESSAGE).toContain('배정회수')
  })

  it('assigns by updating only tours.vehicle_company_id (no settlements write)', () => {
    expect(ADMIN_ACTIONS_SRC).toMatch(/\.from\(['"]tours['"]\)\s*\n?\s*\.update\(\{ vehicle_company_id/)
  })
})

describe('admin vehicle UI (source-level)', () => {
  it('assignment + companies pages are protected by requireAdmin', () => {
    expect(ASSIGN_PAGE_SRC).toContain('requireAdmin')
    expect(COMPANIES_PAGE_SRC).toContain('requireAdmin')
  })

  it('assignment table shows only operational fields, no money', () => {
    for (const financial of ['payout', 'usd', 'vnd', 'profit', '정산', '금액']) {
      expect(ASSIGN_TABLE_SRC).not.toContain(financial)
    }
  })

  it('assignment table uses the simplified status labels', () => {
    expect(ASSIGN_TABLE_SRC).toContain('vehicleAssignmentStatusLabel')
    expect(ASSIGN_TABLE_SRC).toContain('canChangeVehicleAssignment')
  })
})

describe('DB branch-match trigger remains as defense-in-depth (Phase 1 SQL)', () => {
  it('step 2 schema still defines the tour branch-match trigger', () => {
    expect(STEP2_SQL).toContain('trg_enforce_tour_vehicle_company_branch_match')
    expect(STEP2_SQL).toContain('enforce_tour_vehicle_company_branch_match')
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
