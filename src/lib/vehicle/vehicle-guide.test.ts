import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  canAccessAdminRoutes,
  canAccessGuideRoutes,
  canAccessVehicleRoutes,
  isAdminTier,
} from '@/lib/auth/permissions'
import {
  GUIDE_ISSUE_NOTE_MAX,
  guideCheckDetailLabel,
  guideCheckListStatusLabel,
  normalizeGuideCheckPayload,
  validateGuideCheckForSubmit,
} from './guide-check'

const ACTIONS_SRC = readFileSync('src/lib/actions/vehicleGuideActions.ts', 'utf8')
const LIST_SRC = readFileSync('src/app/guide/vehicle-reports/page.tsx', 'utf8')
const DETAIL_SRC = readFileSync('src/app/guide/vehicle-reports/[tourId]/page.tsx', 'utf8')
const FORM_SRC = readFileSync('src/app/guide/vehicle-reports/[tourId]/GuideVehicleCheckForm.tsx', 'utf8')
const LAYOUT_SRC = readFileSync('src/app/guide/layout.tsx', 'utf8')
const RPC_SQL = readFileSync('supabase/vehicle_company_v1_2_recall_cleanup_rpc.sql', 'utf8')

describe('guide check — pure helpers', () => {
  it('list-level status is only 가이드 미확인 / 가이드 확인', () => {
    expect(guideCheckListStatusLabel(false)).toBe('가이드 미확인')
    expect(guideCheckListStatusLabel(true)).toBe('가이드 확인')
  })

  it('detail label maps no_issue/issue_reported to 이상없음/이상있음', () => {
    expect(guideCheckDetailLabel('no_issue')).toBe('이상없음')
    expect(guideCheckDetailLabel('issue_reported')).toBe('이상있음')
  })

  it('normalize drops note for no_issue and trims/caps note for issue_reported', () => {
    expect(normalizeGuideCheckPayload({ check_status: 'no_issue', issue_note: 'x' }))
      .toEqual({ check_status: 'no_issue', issue_note: '' })
    expect(normalizeGuideCheckPayload({ check_status: 'issue_reported', issue_note: '  hi  ' }))
      .toEqual({ check_status: 'issue_reported', issue_note: 'hi' })
    const long = normalizeGuideCheckPayload({ check_status: 'issue_reported', issue_note: 'y'.repeat(5000) })
    expect(long.issue_note).toHaveLength(GUIDE_ISSUE_NOTE_MAX)
  })

  it('validate rejects unknown status, accepts both valid statuses', () => {
    expect(validateGuideCheckForSubmit({ check_status: 'maybe' }).ok).toBe(false)
    expect(validateGuideCheckForSubmit({}).ok).toBe(false)
    const noIssue = validateGuideCheckForSubmit({ check_status: 'no_issue' })
    expect(noIssue.ok).toBe(true)
    if (noIssue.ok) expect(noIssue.payload.issue_note).toBe('')
    const issue = validateGuideCheckForSubmit({ check_status: 'issue_reported', issue_note: 'note' })
    expect(issue.ok).toBe(true)
    if (issue.ok) expect(issue.payload).toEqual({ check_status: 'issue_reported', issue_note: 'note' })
  })
})

describe('guide actions — read scope (source-level)', () => {
  it('list selects only SUBMITTED reports (drafts excluded)', () => {
    // Both list and detail queries pin status to submitted.
    const submittedFilters = ACTIONS_SRC.match(/\.eq\(['"]status['"],\s*['"]submitted['"]\)/g) ?? []
    expect(submittedFilters.length).toBeGreaterThanOrEqual(2)
    expect(ACTIONS_SRC).not.toMatch(/\.eq\(['"]status['"],\s*['"]draft['"]\)/)
  })

  it('derives only checked boolean (가이드 미확인 / 가이드 확인) at list level', () => {
    expect(ACTIONS_SRC).toContain('checked: checkedReportIds.has')
    expect(LIST_SRC).toContain('guideCheckListStatusLabel')
    // No formal 미작성/제출완료/이상 statuses leak into the list UI.
    expect(LIST_SRC).not.toContain('미작성')
    expect(LIST_SRC).not.toContain('제출완료')
  })

  it('no "차량 리포트 미작성" formal status is introduced anywhere', () => {
    for (const src of [ACTIONS_SRC, LIST_SRC, DETAIL_SRC, FORM_SRC]) {
      expect(src).not.toContain('미작성')
    }
  })
})

describe('guide actions — settlement separation (source-level)', () => {
  it('never queries settlements or financial tables', () => {
    expect(ACTIONS_SRC).not.toMatch(/from\(['"]settlements['"]\)/)
    expect(ACTIONS_SRC).not.toMatch(/from\(['"]settlement_/)
    expect(ACTIONS_SRC).not.toMatch(/company_expense/)
  })

  it('does not call any settlement submit RPC', () => {
    expect(ACTIONS_SRC).not.toMatch(/\.rpc\(/)
  })

  it('does not select settlement money fields', () => {
    for (const financial of [
      'ground_fee', 'guide_daily_fee', 'settlement_ratio', 'tip_received',
      'option_credit', 'vehicle_fee_usd', 'calc_summary', 'guide_payout', 'company_profit',
    ]) {
      expect(ACTIONS_SRC).not.toContain(financial)
    }
  })

  it('imports no settlement calc/status/action modules', () => {
    expect(ACTIONS_SRC).not.toContain('@/lib/settlement/calc')
    expect(ACTIONS_SRC).not.toContain('@/lib/settlement/status')
    expect(ACTIONS_SRC).not.toContain('status-guards')
    expect(ACTIONS_SRC).not.toContain('settlementActions')
  })
})

describe('guide check — insert-once (source-level)', () => {
  it('inserts a check and never updates/deletes vehicle_report_checks', () => {
    expect(ACTIONS_SRC).toMatch(/from\(['"]vehicle_report_checks['"]\)\s*\n?\s*\.insert\(/)
    expect(ACTIONS_SRC).not.toMatch(/from\(['"]vehicle_report_checks['"]\)[\s\S]*?\.update\(/)
    expect(ACTIONS_SRC).not.toMatch(/from\(['"]vehicle_report_checks['"]\)[\s\S]*?\.delete\(/)
  })

  it('guards against a pre-existing check with a friendly message', () => {
    expect(ACTIONS_SRC).toContain('이미 확인을 완료한 리포트입니다.')
    expect(ACTIONS_SRC).toContain("=== '23505'")
  })

  it('validates before insert', () => {
    expect(ACTIONS_SRC).toContain('validateGuideCheckForSubmit')
  })
})

describe('guide check — UI states (source-level)', () => {
  it('detail renders the report read-only (no edit inputs for report fields)', () => {
    expect(DETAIL_SRC).toContain('ReadField')
    expect(DETAIL_SRC).toContain('날짜별 동선')
    expect(DETAIL_SRC).toContain('특이사항')
    // Guides never edit vehicle_route_reports content.
    expect(DETAIL_SRC).not.toContain('saveVehicleReportDraft')
    expect(DETAIL_SRC).not.toContain('submitVehicleReport')
  })

  it('form shows a read-only result when a check already exists', () => {
    expect(FORM_SRC).toContain('가이드 확인 완료')
    expect(FORM_SRC).toContain('if (check)')
    expect(FORM_SRC).toContain('한 번 확인하면 수정할 수 없습니다.')
  })

  it('form offers 이상없음 / 이상있음 with optional memo only for issue', () => {
    expect(FORM_SRC).toContain('이상없음')
    expect(FORM_SRC).toContain('이상있음')
    expect(FORM_SRC).toContain("status === 'issue_reported'")
    expect(FORM_SRC).toContain('확인 완료')
  })

  it('list shows the period-filtered empty state message', () => {
    expect(LIST_SRC).toContain('GUIDE_VEHICLE_REPORT_EMPTY_MESSAGE')
  })
})

describe('guide vehicle-reports — route protection', () => {
  it('guide route group is protected by requireGuide', () => {
    expect(LAYOUT_SRC).toContain('requireGuide')
    expect(LAYOUT_SRC).toMatch(/await requireGuide\(\)/)
  })

  it('guide action gates to guide role via cached getSession', () => {
    expect(ACTIONS_SRC).toContain('getSession()')
    expect(ACTIONS_SRC).toContain('isGuide(session.role')
    expect(ACTIONS_SRC).not.toMatch(/getGuideCtx[\s\S]*?auth\.getUser\(\)/)
  })
})

describe('role tiers unchanged', () => {
  it('vehicle_company stays out of guide/admin; guide keeps guide routes', () => {
    expect(canAccessGuideRoutes('guide')).toBe(true)
    expect(canAccessVehicleRoutes('vehicle_company')).toBe(true)
    expect(isAdminTier('vehicle_company')).toBe(false)
    expect(canAccessGuideRoutes('vehicle_company')).toBe(false)
    expect(canAccessAdminRoutes('vehicle_company')).toBe(false)
  })
})

describe('recall cleanup unchanged (regression guard)', () => {
  const V2_SQL = readFileSync('supabase/vehicle_company_v2_profile_assignment.sql', 'utf8')

  it('recall RPC still deletes reports + clears assignment (cascade for checks)', () => {
    expect(RPC_SQL).toMatch(/DELETE FROM public\.vehicle_route_reports WHERE tour_id = p_tour_id/)
    expect(V2_SQL).toMatch(/DELETE FROM public\.vehicle_route_reports WHERE tour_id = p_tour_id/)
    expect(V2_SQL).toContain('vehicle_company_profile_id = NULL')
  })
})
