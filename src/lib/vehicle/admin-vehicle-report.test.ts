import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isMasterAdmin } from '@/lib/auth/permissions'
import {
  adminVehicleReportDetailHref,
  adminVehicleReportGuideCheckDetailLabel,
  adminVehicleReportGuideCheckListLabel,
  adminVehicleReportIssueNotePreview,
  buildAdminVehicleReportDetailView,
  canAdminViewVehicleReportInBranch,
} from './admin-vehicle-report'

const ADMIN_ACTIONS_SRC = readFileSync('src/lib/actions/vehicleCompanyAdminActions.ts', 'utf8')
const ASSIGN_TABLE_SRC = readFileSync('src/app/admin/vehicle-assignments/VehicleAssignmentTable.tsx', 'utf8')
const DETAIL_PAGE_SRC = readFileSync('src/app/admin/vehicle-reports/[tourId]/page.tsx', 'utf8')

describe('admin vehicle report — guide check summary labels', () => {
  it('shows 가이드 미확인 when submitted report has no guide check', () => {
    expect(
      adminVehicleReportGuideCheckListLabel('submitted', null),
    ).toBe('가이드 미확인')
    expect(adminVehicleReportGuideCheckDetailLabel(null)).toBe('가이드 미확인')
  })

  it('shows 이상없음 guide check result', () => {
    expect(
      adminVehicleReportGuideCheckListLabel('submitted', {
        check_status: 'no_issue',
        checked_at: '2026-06-08T10:00:00Z',
        issue_note: null,
      }),
    ).toBe('가이드 확인 완료 · 이상없음')
    expect(
      adminVehicleReportGuideCheckDetailLabel({
        check_status: 'no_issue',
        issue_note: null,
        checked_at: '2026-06-08T10:00:00Z',
        guide_name: 'Kim',
      }),
    ).toBe('가이드 확인 완료 · 이상없음')
  })

  it('shows 이상있음 guide check result and issue note preview', () => {
    const note = '호텔 픽업 시간이 다릅니다.'
    expect(
      adminVehicleReportGuideCheckListLabel('submitted', {
        check_status: 'issue_reported',
        checked_at: '2026-06-08T11:00:00Z',
        issue_note: note,
      }),
    ).toBe('가이드 확인 완료 · 이상있음')
    expect(
      adminVehicleReportGuideCheckDetailLabel({
        check_status: 'issue_reported',
        issue_note: note,
        checked_at: '2026-06-08T11:00:00Z',
        guide_name: 'Lee',
      }),
    ).toBe('가이드 확인 완료 · 이상있음')
    expect(adminVehicleReportIssueNotePreview(note)).toBe(note)
  })

  it('returns null guide-check label for non-submitted reports', () => {
    expect(adminVehicleReportGuideCheckListLabel('draft', null)).toBeNull()
    expect(adminVehicleReportGuideCheckListLabel('none', null)).toBeNull()
  })
})

describe('admin vehicle report — branch access (pure)', () => {
  it('allows master_admin to view any branch report', () => {
    expect(
      canAdminViewVehicleReportInBranch(
        { role: 'master_admin', assignedRegionId: null },
        'branch-a',
      ),
    ).toBe(true)
  })

  it('allows branch admin only for their own branch', () => {
    expect(
      canAdminViewVehicleReportInBranch(
        { role: 'admin', assignedRegionId: 'branch-a' },
        'branch-a',
      ),
    ).toBe(true)
    expect(
      canAdminViewVehicleReportInBranch(
        { role: 'admin', assignedRegionId: 'branch-a' },
        'branch-b',
      ),
    ).toBe(false)
  })
})

describe('admin vehicle report — detail view helper', () => {
  it('returns submitted vehicle report content with routes and special notes', () => {
    const view = buildAdminVehicleReportDetailView({
      tour: {
        id: 't1',
        tour_code: '260608',
        start_date: '2026-06-08',
        end_date: '2026-06-10',
        branch_id: 'b1',
        guide_name: 'Guide A',
        vehicle_company_name: 'Hanna Ace',
      },
      report: {
        id: 'r1',
        event_code: '투어빌리지',
        event_period_text: '2026-06-08 ~ 2026-06-10',
        pax_text: '18명',
        flight_info_text: 'VN123',
        vehicle_text: '16Seat',
        hotel_text: 'Grand Ace',
        guide_text: 'Kim',
        daily_routes: [{ date: '2026-06-08', route: 'Airport - Hotel' }],
        special_notes: '특이사항',
        submitted_at: '2026-06-08T12:00:00Z',
        submitted_by_name: 'Hanna Ace',
      },
      guide_check: null,
    })

    expect(view.report.event_code).toBe('투어빌리지')
    expect(view.report.daily_routes).toEqual([{ date: '2026-06-08', route: 'Airport - Hotel' }])
    expect(view.report.special_notes).toBe('특이사항')
    expect(view.guide_check).toBeNull()
  })
})

describe('admin vehicle report — actions (source-level)', () => {
  it('assignment list enriches submitted reports with guide checks', () => {
    const body = ADMIN_ACTIONS_SRC.slice(
      ADMIN_ACTIONS_SRC.indexOf('export async function getAdminVehicleAssignmentTours'),
      ADMIN_ACTIONS_SRC.indexOf('export async function getAdminVehicleReportDetail'),
    )
    expect(body).toContain("from('vehicle_report_checks')")
    expect(body).toContain('guide_check_status')
    expect(body).toContain('guide_check_checked_at')
    expect(body).toContain('guide_check_issue_note')
    expect(body).not.toMatch(/from\(['"]settlements['"]\)/)
    expect(body).not.toMatch(/from\(['"]vehicle_companies['"]\)/)
    expect(body).not.toMatch(/from\(['"]vehicle_company_users['"]\)/)
  })

  it('detail action returns submitted report content and applies branch gate', () => {
    const start = ADMIN_ACTIONS_SRC.indexOf('export async function getAdminVehicleReportDetail')
    const end = ADMIN_ACTIONS_SRC.indexOf('async function reportExistsForTour', start)
    const body = ADMIN_ACTIONS_SRC.slice(start, end)
    expect(body).toContain('assertAdminCanAccessSettlementBranch')
    expect(body).toContain(".eq('status', 'submitted')")
    expect(body).toContain('event_period_text')
    expect(body).toContain('daily_routes')
    expect(body).toContain('special_notes')
    expect(body).toContain("from('vehicle_report_checks')")
    expect(body).toContain('vehicle_company_profile_id')
    expect(body).not.toMatch(/\.update\(/)
    expect(body).not.toMatch(/from\(['"]settlements['"]\)/)
  })

  it('master_admin bypasses branch filter in list query', () => {
    expect(ADMIN_ACTIONS_SRC).toContain('isMasterAdmin(ctx.role)')
    expect(isMasterAdmin('master_admin')).toBe(true)
  })
})

describe('admin vehicle report — UI (source-level)', () => {
  it('assignment list shows guide check summary and report link for submitted reports', () => {
    expect(ASSIGN_TABLE_SRC).toContain("tour.report_status === 'submitted'")
    expect(ASSIGN_TABLE_SRC).toContain('제출완료')
    expect(ASSIGN_TABLE_SRC).toContain('adminVehicleReportGuideCheckListLabel')
    expect(ASSIGN_TABLE_SRC).toContain('adminVehicleReportIssueNotePreview')
    expect(ASSIGN_TABLE_SRC).toContain('리포트 보기')
    expect(ASSIGN_TABLE_SRC).toContain('adminVehicleReportDetailHref')
    expect(ASSIGN_TABLE_SRC).not.toMatch(/ground_fee|guide_payout|company_profit|paid_at/)
  })

  it('detail page is admin-protected and read-only', () => {
    expect(DETAIL_PAGE_SRC).toContain('requireAdmin')
    expect(DETAIL_PAGE_SRC).toContain('getAdminVehicleReportDetail')
    expect(DETAIL_PAGE_SRC).toContain('VEHICLE_REPORT_BASIC_INFO_FIELDS')
    expect(DETAIL_PAGE_SRC).toContain('daily_routes')
    expect(DETAIL_PAGE_SRC).toContain('special_notes')
    expect(DETAIL_PAGE_SRC).toContain('adminVehicleReportGuideCheckDetailLabel')
    expect(DETAIL_PAGE_SRC).toContain('이상 메모')
    expect(DETAIL_PAGE_SRC).not.toMatch(/\.update\(|saveVehicle|submitVehicle/i)
    expect(DETAIL_PAGE_SRC).not.toMatch(/ground_fee|guide_payout|company_profit|paid_at/)
    expect(DETAIL_PAGE_SRC).not.toMatch(/receipt/i)
  })

  it('detail route uses tour id path', () => {
    expect(adminVehicleReportDetailHref('tour-123')).toBe('/admin/vehicle-reports/tour-123')
  })
})

describe('admin vehicle report — scope guards', () => {
  it('no receipt files changed in admin vehicle report work', () => {
    for (const src of [ADMIN_ACTIONS_SRC, ASSIGN_TABLE_SRC, DETAIL_PAGE_SRC]) {
      expect(src).not.toMatch(/receipt/i)
    }
  })

  it('no settlement/payment/calculation/status/RPC files touched in new admin report code', () => {
    expect(ADMIN_ACTIONS_SRC).not.toContain('settlementActions')
    expect(ADMIN_ACTIONS_SRC).not.toContain('@/lib/settlement/calc')
    expect(ADMIN_ACTIONS_SRC).not.toContain('@/lib/settlement/status')
    expect(ADMIN_ACTIONS_SRC).not.toMatch(/\.rpc\(/)
  })
})
