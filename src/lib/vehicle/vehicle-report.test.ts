import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  canAccessAdminRoutes,
  canAccessGuideRoutes,
  canAccessVehicleRoutes,
  canMarkSettlementPaid,
  canOperationalAdminReview,
  isAdminTier,
} from '@/lib/auth/permissions'
import {
  isVehicleReportLocked,
  normalizeDailyRoutes,
  normalizeText,
  normalizeVehicleReportPayload,
  validateVehicleReportForSubmit,
  VEHICLE_MAX_DAILY_ROUTES,
} from './report-validation'
import {
  isVehicleReportEditable,
  vehicleReportActionLabel,
  vehicleReportStatusLabel,
} from './report-status'
import {
  buildVehicleReportFormPayload,
  vehicleReportReadOnlyValues,
  VEHICLE_REPORT_BASIC_INFO_FIELDS,
} from './vehicle-report-form'

const ACTIONS_SRC = readFileSync('src/lib/actions/vehicleReportActions.ts', 'utf8')
const FORM_SRC = readFileSync('src/app/vehicle/reports/[tourId]/VehicleReportForm.tsx', 'utf8')
const DASHBOARD_SRC = readFileSync('src/app/vehicle/page.tsx', 'utf8')
const FILTER_SRC = readFileSync('src/app/vehicle/VehicleDashboardDateFilter.tsx', 'utf8')
const LAYOUT_SRC = readFileSync('src/app/vehicle/layout.tsx', 'utf8')

describe('vehicle report — payload normalization', () => {
  it('normalizeText trims, coerces non-strings, and caps length', () => {
    expect(normalizeText('  hello  ')).toBe('hello')
    expect(normalizeText(123)).toBe('')
    expect(normalizeText(null)).toBe('')
    expect(normalizeText('x'.repeat(5000), 10)).toBe('x'.repeat(10))
  })

  it('normalizeDailyRoutes drops fully-empty rows and keeps partial rows', () => {
    const rows = normalizeDailyRoutes([
      { date: '2026-04-22', route: 'Airport - Hotel' },
      { date: '', route: '' },
      { date: '2026-04-23', route: '' },
      { date: '', route: 'Hotel - Golf' },
      'not-an-object',
    ])
    expect(rows).toEqual([
      { date: '2026-04-22', route: 'Airport - Hotel' },
      { date: '2026-04-23', route: '' },
      { date: '', route: 'Hotel - Golf' },
    ])
  })

  it('normalizeDailyRoutes returns [] for non-arrays and caps row count', () => {
    expect(normalizeDailyRoutes(null)).toEqual([])
    expect(normalizeDailyRoutes('nope')).toEqual([])
    const many = Array.from({ length: VEHICLE_MAX_DAILY_ROUTES + 20 }, (_, i) => ({
      date: '',
      route: `r${i}`,
    }))
    expect(normalizeDailyRoutes(many)).toHaveLength(VEHICLE_MAX_DAILY_ROUTES)
  })

  it('normalizeVehicleReportPayload coerces all fields safely', () => {
    const payload = normalizeVehicleReportPayload({
      event_code: '  E1  ',
      daily_routes: [{ date: '2026-01-01', route: 'A - B' }],
      extra: 'ignored',
    })
    expect(payload.event_code).toBe('E1')
    expect(payload.pax_text).toBe('')
    expect(payload.daily_routes).toEqual([{ date: '2026-01-01', route: 'A - B' }])
    expect(Array.isArray(payload.daily_routes)).toBe(true)
  })
})

describe('vehicle report — submit validation', () => {
  it('requires event_code', () => {
    const result = validateVehicleReportForSubmit({ event_code: '', daily_routes: [] })
    expect(result.ok).toBe(false)
  })

  it('requires route text on every kept row', () => {
    const result = validateVehicleReportForSubmit({
      event_code: 'E1',
      daily_routes: [{ date: '2026-04-22', route: '' }],
    })
    expect(result.ok).toBe(false)
  })

  it('passes and returns normalized payload when valid', () => {
    const result = validateVehicleReportForSubmit({
      event_code: ' E1 ',
      daily_routes: [{ date: '2026-04-22', route: ' Airport - Hotel ' }],
      special_notes: ' note ',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.event_code).toBe('E1')
      expect(result.payload.daily_routes).toEqual([{ date: '2026-04-22', route: 'Airport - Hotel' }])
      expect(result.payload.special_notes).toBe('note')
    }
  })
})

describe('vehicle report — status helpers (read-only logic)', () => {
  it('locks only submitted reports', () => {
    expect(isVehicleReportLocked('submitted')).toBe(true)
    expect(isVehicleReportLocked('draft')).toBe(false)
    expect(isVehicleReportLocked(null)).toBe(false)
    expect(isVehicleReportEditable('submitted')).toBe(false)
    expect(isVehicleReportEditable('draft')).toBe(true)
    expect(isVehicleReportEditable('none')).toBe(true)
  })

  it('maps dashboard status to Korean labels and actions', () => {
    expect(vehicleReportStatusLabel('none')).toBe('작성 가능')
    expect(vehicleReportStatusLabel('draft')).toBe('작성중')
    expect(vehicleReportStatusLabel('submitted')).toBe('제출완료')
    expect(vehicleReportActionLabel('none')).toBe('리포트 작성')
    expect(vehicleReportActionLabel('draft')).toBe('리포트 수정')
    expect(vehicleReportActionLabel('submitted')).toBe('제출완료 보기')
  })
})

describe('vehicle report — settlement separation (source-level)', () => {
  it('action module never queries settlements or financial tables', () => {
    expect(ACTIONS_SRC).not.toMatch(/from\(['"]settlements['"]\)/)
    expect(ACTIONS_SRC).not.toMatch(/from\(['"]settlement_/)
    expect(ACTIONS_SRC).not.toMatch(/company_expense/)
  })

  it('action module adds no settlement submit RPC or calc/payout/status imports', () => {
    expect(ACTIONS_SRC).not.toMatch(/\.rpc\(/)
    expect(ACTIONS_SRC).not.toContain('@/lib/settlement/calc')
    expect(ACTIONS_SRC).not.toContain('@/lib/settlement/status')
    expect(ACTIONS_SRC).not.toContain('status-guards')
    expect(ACTIONS_SRC).not.toContain('settlementActions')
  })

  it('assigned-tours tour select excludes financial fields', () => {
    // Only operational tour columns are selected; no settlement money fields.
    for (const financial of [
      'ground_fee', 'guide_daily_fee', 'settlement_ratio', 'tip_received',
      'option_credit', 'vehicle_fee_usd', 'calc_summary',
    ]) {
      expect(ACTIONS_SRC).not.toContain(financial)
    }
  })
})

describe('vehicle report — profile-based context (source-level)', () => {
  it('getVehicleCtx does not query vehicle_company_users', () => {
    expect(ACTIONS_SRC).not.toMatch(/from\(['"]vehicle_company_users['"]\)/)
    expect(ACTIONS_SRC).not.toMatch(/vehicleCompanyId/)
    expect(ACTIONS_SRC).toContain('isVehicleCompany(profile.role')
    expect(ACTIONS_SRC).toContain('profileId: user.id')
  })

  it('dashboard and detail queries filter by vehicle_company_profile_id', () => {
    expect(ACTIONS_SRC).toContain("vehicle_company_profile_id', ctx.profileId")
    expect(ACTIONS_SRC).not.toMatch(/vehicle_company_id/)
  })

  it('assigned-tours query applies date filter before limit and enriches guide checks', () => {
    const fnStart = ACTIONS_SRC.indexOf('export async function getVehicleCompanyAssignedTours')
    const fnEnd = ACTIONS_SRC.indexOf('export async function getVehicleReportForTour', fnStart)
    const body = ACTIONS_SRC.slice(fnStart, fnEnd)
    expect(body).toContain('AdminDateRangeFilter')
    expect(body).toContain("filter.range !== 'all'")
    expect(body).toMatch(/if \(filter\.from\) tourQuery = tourQuery\.gte\('start_date', filter\.from\)/)
    expect(body).toMatch(/if \(filter\.to\) tourQuery = tourQuery\.lte\('start_date', filter\.to\)/)
    const profileIdx = body.indexOf("vehicle_company_profile_id', ctx.profileId")
    const gteIdx = body.indexOf("filter.from) tourQuery")
    const limitIdx = body.indexOf('.limit(listLimit)')
    const orderIdx = body.indexOf(".order('start_date'")
    expect(profileIdx).toBeGreaterThan(-1)
    expect(gteIdx).toBeGreaterThan(profileIdx)
    expect(orderIdx).toBeGreaterThan(gteIdx)
    expect(limitIdx).toBeGreaterThan(orderIdx)
    expect(body).toContain("from('vehicle_report_checks')")
    expect(body).toContain('guide_check_status')
    expect(body).not.toMatch(/from\(['"]settlements['"]\)/)
  })

  it('vehicle company list is scoped to the logged-in profile only', () => {
    expect(ACTIONS_SRC).toContain(".eq('vehicle_company_profile_id', ctx.profileId)")
    expect(ACTIONS_SRC).not.toMatch(/from\(['"]vehicle_company_users['"]\)/)
    expect(ACTIONS_SRC).not.toMatch(/from\(['"]vehicle_companies['"]\)/)
  })

  it('report insert writes vehicle_company_profile_id', () => {
    expect(ACTIONS_SRC).toContain('vehicle_company_profile_id: ctx.profileId')
  })
})

describe('vehicle report — draft/submit behavior (source-level)', () => {
  it('inserts new reports only as draft and rejects locked reports', () => {
    expect(ACTIONS_SRC).toContain("status: 'draft'")
    expect(ACTIONS_SRC).toContain('isVehicleReportLocked(existing.status')
    expect(ACTIONS_SRC).toContain('이미 제출된 리포트는 수정할 수 없습니다.')
  })

  it('draft update is gated to status=draft rows', () => {
    expect(ACTIONS_SRC).toMatch(/\.eq\(['"]status['"],\s*['"]draft['"]\)/)
  })

  it('final submit sets submitted status fields and gates on draft', () => {
    expect(ACTIONS_SRC).toContain("status: 'submitted'")
    expect(ACTIONS_SRC).toContain('submitted_at:')
    expect(ACTIONS_SRC).toContain('submitted_by: ctx.profileId')
    expect(ACTIONS_SRC).toContain('validateVehicleReportForSubmit')
  })

  it('draft save persists every basic-info column and daily routes', () => {
    expect(ACTIONS_SRC).toContain('reportContentColumns(payload)')
    const columnsStart = ACTIONS_SRC.indexOf('function reportContentColumns')
    const columnsBody = ACTIONS_SRC.slice(columnsStart, columnsStart + 700)
    for (const key of [
      'event_code',
      'event_period_text',
      'pax_text',
      'flight_info_text',
      'vehicle_text',
      'hotel_text',
      'guide_text',
      'daily_routes',
      'special_notes',
    ]) {
      expect(columnsBody).toContain(`${key}: payload.${key}`)
    }
  })

  it('final submit re-writes all basic-info columns in the same submit update', () => {
    const submitStart = ACTIONS_SRC.indexOf('export async function submitVehicleReport')
    const submitBody = ACTIONS_SRC.slice(submitStart)
    expect(submitBody).toContain('reportContentColumns(validation.payload)')

    const columnsStart = ACTIONS_SRC.indexOf('function reportContentColumns')
    const columnsBody = ACTIONS_SRC.slice(columnsStart, columnsStart + 700)
    for (const key of [
      'event_code',
      'event_period_text',
      'pax_text',
      'flight_info_text',
      'vehicle_text',
      'hotel_text',
      'guide_text',
      'daily_routes',
      'special_notes',
    ]) {
      expect(columnsBody).toContain(`${key}: payload.${key}`)
    }
  })

  it('save draft and final submit actions are wired to distinct handlers', () => {
    const saveDraftBody = FORM_SRC.slice(
      FORM_SRC.indexOf('const handleSaveDraft'),
      FORM_SRC.indexOf('const handleSubmit'),
    )
    const submitBody = FORM_SRC.slice(FORM_SRC.indexOf('const handleSubmit'))
    expect(saveDraftBody).toContain('saveVehicleReportDraft(tourId, buildPayload())')
    expect(saveDraftBody).not.toContain('submitVehicleReport')
    expect(submitBody).toContain('submitVehicleReport(tourId, buildPayload())')
    expect(submitBody).not.toContain('saveVehicleReportDraft')
  })
})

describe('vehicle report — form/read-only field mapping', () => {
  const samplePayload = normalizeVehicleReportPayload({
    event_code: '260608',
    event_period_text: '2026-06-08 ~ 2026-06-10',
    pax_text: '18명',
    flight_info_text: 'VN123',
    vehicle_text: '16Seat',
    hotel_text: 'Grand Ace',
    guide_text: 'Kim Guide',
    daily_routes: [{ date: '2026-06-08', route: 'Airport - Hotel' }],
    special_notes: '특이사항 메모',
  })

  it('form write keys match read-only display keys', () => {
    const written = buildVehicleReportFormPayload(samplePayload)
    const readOnly = vehicleReportReadOnlyValues(samplePayload)
    for (const { key } of VEHICLE_REPORT_BASIC_INFO_FIELDS) {
      expect(written[key]).toBe(readOnly[key])
    }
    expect(written.daily_routes).toEqual(readOnly.daily_routes)
    expect(written.special_notes).toBe(readOnly.special_notes)
  })

  it('draft save and final submit preserve all basic-info fields in payload helpers', () => {
    const payload = buildVehicleReportFormPayload(samplePayload)
    expect(payload.event_code).toBe('260608')
    expect(payload.event_period_text).toBe('2026-06-08 ~ 2026-06-10')
    expect(payload.pax_text).toBe('18명')
    expect(payload.flight_info_text).toBe('VN123')
    expect(payload.vehicle_text).toBe('16Seat')
    expect(payload.hotel_text).toBe('Grand Ace')
    expect(payload.guide_text).toBe('Kim Guide')
    expect(payload.special_notes).toBe('특이사항 메모')
  })

  it('draft save and final submit preserve daily route rows in payload helpers', () => {
    const payload = buildVehicleReportFormPayload(samplePayload)
    expect(payload.daily_routes).toEqual([{ date: '2026-06-08', route: 'Airport - Hotel' }])
  })
})

describe('vehicle report — UI source-level guards', () => {
  it('form renders a read-only state for submitted reports', () => {
    expect(FORM_SRC).toContain("report?.status === 'submitted'")
    expect(FORM_SRC).toContain('제출완료된 리포트입니다')
  })

  it('submitted read-only view renders saved server report, not editable client state', () => {
    expect(FORM_SRC).toContain('vehicleReportReadOnlyValues(report)')
    expect(FORM_SRC).toContain('VEHICLE_REPORT_BASIC_INFO_FIELDS.map')
    expect(FORM_SRC).toContain('saved.daily_routes')
    expect(FORM_SRC).not.toMatch(/if \(locked\)[\s\S]*ReadOnlyValue value=\{eventCode\}/)
  })

  it('draft remains editable and syncs refreshed report into form state', () => {
    expect(FORM_SRC).toContain('useEffect')
    expect(FORM_SRC).toContain('if (locked) return')
    expect(FORM_SRC).toContain("onClick={handleSaveDraft}")
    expect(FORM_SRC).toContain("onClick={handleSubmit}")
    expect(FORM_SRC).not.toContain('redirect(')
  })

  it('dashboard shows report + guide-check status and the empty state', () => {
    expect(DASHBOARD_SRC).toContain('vehicleDashboardReportStatusLabel')
    expect(DASHBOARD_SRC).toContain('vehicleDashboardGuideCheckLabel')
    expect(DASHBOARD_SRC).toContain('guide_check_status')
    expect(DASHBOARD_SRC).toContain('vehicleDashboardIssueNotePreview')
    expect(DASHBOARD_SRC).toContain('배정된 차량 리포트 대상이 없습니다.')
    expect(DASHBOARD_SRC).not.toMatch(/ground_fee|guide_payout|company_profit|paid_at/)
  })

  it('dashboard uses shareable date filters', () => {
    expect(DASHBOARD_SRC).toContain('parseVehicleDashboardSearchParams')
    expect(DASHBOARD_SRC).toContain('getVehicleCompanyAssignedTours(dateFilter)')
    expect(DASHBOARD_SRC).toContain('VehicleDashboardDateFilterBar')
    expect(FILTER_SRC).toContain('VEHICLE_DASHBOARD_CURRENT_MONTH_NOTICE')
    expect(FILTER_SRC).toContain('vehicleDashboardQuickRangeUrls')
    expect(FILTER_SRC).not.toMatch(/delete|archive|삭제/i)
  })

  it('/vehicle route group is protected by requireVehicleCompany', () => {
    expect(LAYOUT_SRC).toContain('requireVehicleCompany')
    expect(LAYOUT_SRC).toMatch(/await requireVehicleCompany\(\)/)
  })
})

describe('vehicle report — vehicle_company stays out of admin/guide tiers', () => {
  it('vehicle_company is excluded from admin/guide permissions', () => {
    expect(canAccessVehicleRoutes('vehicle_company')).toBe(true)
    expect(isAdminTier('vehicle_company')).toBe(false)
    expect(canAccessGuideRoutes('vehicle_company')).toBe(false)
    expect(canAccessAdminRoutes('vehicle_company')).toBe(false)
    expect(canMarkSettlementPaid('vehicle_company')).toBe(false)
    expect(canOperationalAdminReview('vehicle_company')).toBe(false)
  })
})
