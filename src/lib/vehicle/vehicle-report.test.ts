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

const ACTIONS_SRC = readFileSync('src/lib/actions/vehicleReportActions.ts', 'utf8')
const FORM_SRC = readFileSync('src/app/vehicle/reports/[tourId]/VehicleReportForm.tsx', 'utf8')
const DASHBOARD_SRC = readFileSync('src/app/vehicle/page.tsx', 'utf8')
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
})

describe('vehicle report — UI source-level guards', () => {
  it('form renders a read-only state for submitted reports', () => {
    expect(FORM_SRC).toContain("report?.status === 'submitted'")
    expect(FORM_SRC).toContain('제출완료된 리포트입니다')
  })

  it('dashboard uses the simple status labels and shows the empty state', () => {
    expect(DASHBOARD_SRC).toContain('vehicleReportStatusLabel')
    expect(DASHBOARD_SRC).toContain('배정된 차량 리포트 대상이 없습니다.')
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
