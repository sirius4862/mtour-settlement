import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SettlementWithTour } from '@/types'
import {
  buildGuideHistoryUrl,
  expandGuideHistoryStatusFilter,
  guideHistorySinceDate,
  matchesGuideHistoryFilters,
  normalizeGuideHistoryPage,
  parseGuideHistoryPeriod,
  parseGuideHistoryStatus,
} from './settlement-history'

const ROOT = process.cwd()

function settlement(overrides: Partial<SettlementWithTour>): SettlementWithTour {
  return {
    id: 'settlement-1',
    tour_id: 'tour-1',
    guide_id: 'guide-1',
    branch_id: 'branch-1',
    status: 'submitted',
    year_month: '2026-05',
    exchange_rate: 1,
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
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    tour: {
      id: 'tour-1',
      tour_code: 'DN-2026-001',
      pattern: 'Da Nang Family Tour',
      agency_name: 'Agency',
      start_date: '2026-05-20',
      end_date: '2026-05-24',
      nights: 4,
      pax_count: 12,
      vehicle_type: null,
      guide_id: 'guide-1',
      tc_name: null,
      branch_id: 'branch-1',
      created_by: 'admin-1',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
    },
    ...overrides,
  }
}

describe('guide settlement history filters', () => {
  const now = new Date('2026-06-04T00:00:00Z')

  it('parses status, period, and page filters safely', () => {
    expect(parseGuideHistoryStatus('submitted')).toBe('submitted')
    expect(parseGuideHistoryStatus('approved')).toBe('')
    expect(parseGuideHistoryStatus('nope')).toBe('')
    expect(parseGuideHistoryPeriod('30d')).toBe('30d')
    expect(parseGuideHistoryPeriod('all')).toBe('all')
    expect(parseGuideHistoryPeriod('bad')).toBe('all')
    expect(normalizeGuideHistoryPage('3')).toBe(3)
    expect(normalizeGuideHistoryPage('-1')).toBe(1)
  })

  it('expands guide status filters to legacy statuses without changing workflow values', () => {
    expect(expandGuideHistoryStatusFilter('edit_requested')).toEqual([
      'edit_requested',
      'rejected',
      'clarification_requested',
    ])
    expect(expandGuideHistoryStatusFilter('pending_guide_confirmation')).toEqual([
      'pending_guide_confirmation',
      'approved',
    ])
    expect(expandGuideHistoryStatusFilter()).toBeNull()
  })

  it('filters by status, period, and keyword', () => {
    const row = settlement({})
    expect(matchesGuideHistoryFilters(row, { status: 'submitted', period: '90d', search: 'family' }, now)).toBe(true)
    expect(matchesGuideHistoryFilters(row, { status: 'draft', period: '90d' }, now)).toBe(false)
    expect(matchesGuideHistoryFilters(row, { period: '30d' }, now)).toBe(true)
    expect(matchesGuideHistoryFilters(row, { search: 'DN-2026' }, now)).toBe(true)
    expect(matchesGuideHistoryFilters(row, { search: 'missing' }, now)).toBe(false)
  })

  it('builds pagination and reset URLs for the history page', () => {
    expect(buildGuideHistoryUrl({})).toBe('/guide/settlements')
    expect(buildGuideHistoryUrl({ status: 'submitted', period: '90d', search: 'DN', page: 2 })).toBe(
      '/guide/settlements?status=submitted&period=90d&search=DN&page=2',
    )
    expect(buildGuideHistoryUrl({ period: 'all' })).toBe('/guide/settlements')
  })

  it('documents the required guide dashboard/history wiring', () => {
    const dashboard = readFileSync(join(ROOT, 'src/app/guide/page.tsx'), 'utf8')
    const historyPage = readFileSync(join(ROOT, 'src/app/guide/settlements/page.tsx'), 'utf8')

    expect(dashboard).toContain('전체 정산서 보기')
    expect(historyPage).toContain('getMySettlementHistory')
    expect(historyPage).toContain('name="status"')
    expect(historyPage).toContain('name="period"')
    expect(historyPage).toContain('name="search"')
    expect(historyPage).toContain('settlementHref')
  })

  it('documents the guide dashboard work-queue layout', () => {
    const dashboard = readFileSync(join(ROOT, 'src/app/guide/page.tsx'), 'utf8')

    expect(dashboard).not.toContain('정산 현황')
    expect(dashboard).not.toContain('grid-cols-4')
    expect(dashboard).not.toContain('검토중')
    expect(dashboard).not.toContain('확인대기')
    expect(dashboard).toContain('{session.full_name}님')
    expect(dashboard).not.toContain('{session.full_name} 가이드님')

    const greeting = dashboard.indexOf('안녕하세요,')
    const assignedTours = dashboard.indexOf('배정된 투어')
    const draft = dashboard.indexOf('작성중')
    const editRequested = dashboard.indexOf('수정 필요')
    const pendingConfirmation = dashboard.indexOf('최종 확인 필요')
    const recent = dashboard.indexOf('최근 정산서')

    expect(greeting).toBeGreaterThan(-1)
    expect(assignedTours).toBeGreaterThan(greeting)
    expect(draft).toBeGreaterThan(assignedTours)
    expect(editRequested).toBeGreaterThan(draft)
    expect(pendingConfirmation).toBeGreaterThan(editRequested)
    expect(recent).toBeGreaterThan(pendingConfirmation)

    expect(dashboard).toContain("settlements.filter((s) => s.status === 'draft')")
    expect(dashboard).toContain('이어 작성하기 →')
    expect(dashboard).toContain('href={`/guide/settlements/${s.id}/edit`}')
    expect(dashboard).toContain("s.status === 'pending_guide_confirmation' && s.guide_confirmed_at == null")
    expect(dashboard).toContain('href={`/guide/settlements/${s.id}/confirm`}')
    expect(dashboard).toContain('settlements.slice(0, 3)')
    expect(dashboard).toContain('href="/guide/settlements"')
  })

  it('always renders the 작성중 section with an empty state', () => {
    const dashboard = readFileSync(join(ROOT, 'src/app/guide/page.tsx'), 'utf8')

    expect(dashboard).not.toContain('{draftSettlements.length > 0 && (')
    expect(dashboard).toContain('draftSettlements.length === 0 ? (')
    expect(dashboard).toContain('작성중인 정산서가 없습니다.')
    expect(dashboard).toContain('임시저장한 정산서가 있을 때 표시됩니다.')
  })

  it('documents guide ownership enforcement in the server query', () => {
    const actions = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')

    expect(actions).toContain('export async function getMySettlementHistory')
    expect(actions).toContain(".from(tableForAudience('settlements', useGuideRead))")
    expect(actions).toContain(".eq('guide_id', user.id)")
    expect(actions).toContain(".from('tours')")
    expect(actions).toContain(".eq('guide_id', user.id)")
  })
})
