import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SettlementWithTour } from '@/types'
import { GUIDE_AVAILABLE_TOUR_SELECT } from './available-tours'
import {
  GUIDE_DASHBOARD_DRAFT_STATUSES,
  GUIDE_DASHBOARD_EDIT_REQUESTED_STATUSES,
  GUIDE_DASHBOARD_QUEUE_LIMIT,
  GUIDE_DASHBOARD_RECENT_LIMIT,
  GUIDE_DASHBOARD_SETTLEMENT_SELECT,
  groupSettlementsForGuideDashboard,
  isGuideDashboardPendingConfirmation,
} from './dashboard-settlements'

const ROOT = process.cwd()

function row(
  overrides: Partial<SettlementWithTour> & Pick<SettlementWithTour, 'id' | 'status' | 'created_at'>,
): SettlementWithTour {
  return {
    tour_id: 'tour-1',
    guide_id: 'guide-1',
    branch_id: 'branch-1',
    year_month: '2026-04',
    exchange_rate: 0,
    advance_vnd: 0,
    tour_fee_usd: 0,
    ground_fee_usd: 0,
    charming_other_usd: 0,
    tip_received_usd: 0,
    option_receivable_usd: 0,
    tip_transfer_usd: 0,
    option_credit_usd: 0,
    vehicle_fee_usd: 0,
    head_tax_usd: 0,
    seoul_biz_fee_usd: 0,
    tc_guide_usd: 0,
    tc_company_usd: 0,
    megugi_usd: 0,
    guide_daily_fee_usd: 0,
    settlement_ratio: 0,
    guide_note: null,
    admin_note: null,
    reject_reason: null,
    submitted_at: null,
    reviewed_at: null,
    paid_at: null,
    edit_requested_at: null,
    reviewed_by: null,
    edit_requested_by: null,
    sent_for_confirmation_at: null,
    sent_for_confirmation_by: null,
    guide_confirmed_at: null,
    guide_confirmed_by: null,
    clarification_requested_at: null,
    clarification_message: null,
    active_confirmation_id: null,
    guide_submit_snapshot_id: null,
    calc_summary_json: null,
    updated_at: overrides.created_at,
    tour: {
      id: 'tour-1',
      tour_code: 'APR26-01',
      pattern: 'Test Tour',
      start_date: '2026-04-01',
      end_date: '2026-04-04',
    } as SettlementWithTour['tour'],
    ...overrides,
  }
}

describe('groupSettlementsForGuideDashboard', () => {
  it('groups draft rows for 작성중', () => {
    const grouped = groupSettlementsForGuideDashboard([
      row({ id: 'd1', status: 'draft', created_at: '2026-04-02T00:00:00Z' }),
      row({ id: 's1', status: 'submitted', created_at: '2026-04-03T00:00:00Z' }),
    ])
    expect(grouped.draft.map((s) => s.id)).toEqual(['d1'])
  })

  it('groups edit_requested only for 수정 필요', () => {
    const grouped = groupSettlementsForGuideDashboard([
      row({ id: 'e1', status: 'edit_requested', created_at: '2026-04-02T00:00:00Z' }),
      row({ id: 'r1', status: 'rejected', created_at: '2026-04-03T00:00:00Z' }),
      row({ id: 'c1', status: 'clarification_requested', created_at: '2026-04-04T00:00:00Z' }),
    ])
    expect(grouped.editRequested.map((s) => s.id)).toEqual(['e1'])
  })

  it('groups pending_guide_confirmation without guide_confirmed_at for 최종 확인 필요', () => {
    const grouped = groupSettlementsForGuideDashboard([
      row({
        id: 'p1',
        status: 'pending_guide_confirmation',
        guide_confirmed_at: null,
        created_at: '2026-04-02T00:00:00Z',
      }),
      row({
        id: 'p2',
        status: 'pending_guide_confirmation',
        guide_confirmed_at: '2026-04-03T00:00:00Z',
        created_at: '2026-04-03T00:00:00Z',
      }),
      row({ id: 'a1', status: 'approved', created_at: '2026-04-04T00:00:00Z' }),
    ])
    expect(grouped.pendingConfirmation.map((s) => s.id)).toEqual(['p1'])
  })

  it('caps 최근 정산서 at 3 by created_at desc', () => {
    const grouped = groupSettlementsForGuideDashboard([
      row({ id: 'old', status: 'paid', created_at: '2026-01-01T00:00:00Z' }),
      row({ id: 'n1', status: 'submitted', created_at: '2026-04-04T00:00:00Z' }),
      row({ id: 'n2', status: 'draft', created_at: '2026-04-03T00:00:00Z' }),
      row({ id: 'n3', status: 'paid', created_at: '2026-04-02T00:00:00Z' }),
      row({ id: 'n4', status: 'paid', created_at: '2026-04-01T00:00:00Z' }),
    ])
    expect(grouped.recent.map((s) => s.id)).toEqual(['n1', 'n2', 'n3'])
    expect(GUIDE_DASHBOARD_RECENT_LIMIT).toBe(3)
  })
})

describe('isGuideDashboardPendingConfirmation', () => {
  it('matches only unconfirmed pending_guide_confirmation rows', () => {
    expect(
      isGuideDashboardPendingConfirmation({
        status: 'pending_guide_confirmation',
        guide_confirmed_at: null,
      }),
    ).toBe(true)
    expect(
      isGuideDashboardPendingConfirmation({
        status: 'pending_guide_confirmation',
        guide_confirmed_at: '2026-04-01T00:00:00Z',
      }),
    ).toBe(false)
  })
})

describe('guide dashboard loader wiring', () => {
  it('uses bounded status-specific queries instead of full history', () => {
    const actions = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')
    const start = actions.indexOf('export async function getGuideDashboardSettlements')
    const end = actions.indexOf('export async function getMySettlementHistory', start)
    const body = actions.slice(start, end)

    expect(body).toContain('export async function getGuideDashboardSettlements')
    expect(body).toContain(".eq('status', 'draft')")
    expect(body).toContain(".eq('status', 'edit_requested')")
    expect(body).toContain(".eq('status', 'pending_guide_confirmation')")
    expect(body).toContain(".is('guide_confirmed_at', null)")
    expect(body).toContain(`.limit(GUIDE_DASHBOARD_QUEUE_LIMIT)`)
    expect(body).toContain(`.limit(GUIDE_DASHBOARD_RECENT_LIMIT)`)
    expect(body).toContain('.select(GUIDE_DASHBOARD_SETTLEMENT_SELECT)')
    expect(body).toContain('getSession()')
    expect(body).not.toContain('auth.getUser()')
    expect(body).not.toContain(".select('*, tour:tours(*)')")
    expect(GUIDE_DASHBOARD_QUEUE_LIMIT).toBeGreaterThan(0)
  })

  it('does not fetch all settlements without a status filter except recent limit query', () => {
    const actions = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')
    const start = actions.indexOf('export async function getGuideDashboardSettlements')
    const end = actions.indexOf('export async function getMySettlementHistory', start)
    const body = actions.slice(start, end)

    const recentBlock = body.slice(body.indexOf('baseQuery()'))
    expect(recentBlock).toContain('.limit(GUIDE_DASHBOARD_RECENT_LIMIT)')
  })

  it('keeps dashboard status constants explicit', () => {
    expect(GUIDE_DASHBOARD_DRAFT_STATUSES).toEqual(['draft'])
    expect(GUIDE_DASHBOARD_EDIT_REQUESTED_STATUSES).toEqual(['edit_requested'])
    expect(GUIDE_DASHBOARD_SETTLEMENT_SELECT).not.toContain('calc_summary_json')
  })
})

describe('guide dashboard page wiring', () => {
  it('loads assigned tours without a recent-date cutoff', () => {
    const actions = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')
    const start = actions.indexOf('export async function getAvailableTours')
    const end = actions.indexOf('const LINE_ITEM_TABLES', start)
    const body = actions.slice(start, end)

    expect(body).not.toContain('90 * 24 * 60 * 60 * 1000')
    expect(body).not.toContain(".gte('start_date', since)")
    expect(body).toContain(".neq('assignment_status', 'recalled')")
    expect(body).toContain('GUIDE_AVAILABLE_TOUR_SELECT')
    expect(body).not.toContain(".select('*')")
    expect(body).toContain('getSession()')
    expect(body).not.toContain('auth.getUser()')
    expect(GUIDE_AVAILABLE_TOUR_SELECT).toContain('tour_code')
    expect(GUIDE_AVAILABLE_TOUR_SELECT).toContain('branch_id')
    expect(GUIDE_AVAILABLE_TOUR_SELECT).not.toContain('*')
  })

  it('scopes dashboard loaders to the authenticated guide id', () => {
    const actions = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')
    const toursStart = actions.indexOf('export async function getAvailableTours')
    const toursEnd = actions.indexOf('const LINE_ITEM_TABLES', toursStart)
    const toursBody = actions.slice(toursStart, toursEnd)

    const settlementsStart = actions.indexOf('export async function getGuideDashboardSettlements')
    const settlementsEnd = actions.indexOf('export async function getMySettlementHistory', settlementsStart)
    const settlementsBody = actions.slice(settlementsStart, settlementsEnd)

    expect(toursBody).toContain(".eq('guide_id', session.id)")
    expect(settlementsBody).toContain(".eq('guide_id', session.id)")
  })

  it('loads dashboard sections from getGuideDashboardSettlements', () => {
    const dashboard = readFileSync(join(ROOT, 'src/app/guide/page.tsx'), 'utf8')

    expect(dashboard).toContain('getGuideDashboardSettlements')
    expect(dashboard).not.toContain('getMySettlements')
    expect(dashboard).not.toContain('settlements.filter((s) => s.status ===')
    expect(dashboard).not.toContain('settlements.slice(0, 3)')
    expect(dashboard).toContain('draft: draftSettlements')
    expect(dashboard).toContain('배정된 투어')
    expect(dashboard).toContain('정산서가 없는 배정 투어만 표시됩니다.')
    expect(dashboard).toContain('작성중')
    expect(dashboard).toContain('수정 필요')
    expect(dashboard).toContain('최종 확인 필요')
    expect(dashboard).toContain('최근 정산서')
  })

  it('does not change admin settlement list loaders', () => {
    const actions = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')

    expect(actions).toContain('getAdminUnsubmittedSettlements')
    expect(actions).toContain('getAdminSettlements')
  })
})
