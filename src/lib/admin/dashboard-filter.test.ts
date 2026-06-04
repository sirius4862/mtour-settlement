import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { aggregateSettlementStatusCounts } from './settlement-list'
import {
  buildAdminDashboardUrl,
  countDashboardFilteredRows,
  parseDashboardStatusFilter,
  resolveDashboardRegionFilter,
} from './dashboard-filter'

const ROOT = process.cwd()

describe('admin dashboard status filters', () => {
  const rows = [
    { status: 'draft', branch_id: 'danang' },
    { status: 'submitted', branch_id: 'danang' },
    { status: 'submitted', branch_id: 'danang' },
    { status: 'submitted', branch_id: 'phuquoc' },
    { status: 'paid', branch_id: 'phuquoc' },
    { status: 'approved', branch_id: 'phuquoc' },
    { status: 'pending_guide_confirmation', branch_id: 'danang' },
    { status: 'clarification_requested', branch_id: 'danang' },
  ]

  it('builds clickable status-card links and 전체 보기 reset links', () => {
    expect(buildAdminDashboardUrl({ status: 'submitted' })).toBe('/admin?status=submitted')
    expect(buildAdminDashboardUrl({ status: 'paid', regionId: 'phuquoc' })).toBe(
      '/admin?status=paid&regionId=phuquoc',
    )
    expect(buildAdminDashboardUrl({ regionId: 'danang' })).toBe('/admin?regionId=danang')
    expect(buildAdminDashboardUrl()).toBe('/admin')
  })

  it('accepts only workflow dashboard statuses as active card state', () => {
    expect(parseDashboardStatusFilter('submitted')).toBe('submitted')
    expect(parseDashboardStatusFilter('paid')).toBe('paid')
    expect(parseDashboardStatusFilter('approved')).toBe('')
    expect(parseDashboardStatusFilter('not-a-status')).toBe('')
  })

  it('keeps region and status filters working together', () => {
    expect(countDashboardFilteredRows(rows, { regionId: 'danang', status: 'submitted' })).toBe(2)
    expect(countDashboardFilteredRows(rows, { regionId: 'phuquoc', status: 'paid' })).toBe(1)
    expect(countDashboardFilteredRows(rows, { regionId: 'danang', status: 'edit_requested' })).toBe(1)
    expect(countDashboardFilteredRows(rows, { regionId: 'phuquoc', status: 'pending_guide_confirmation' })).toBe(1)
  })

  it('keeps card counts consistent with filtered result totals', () => {
    const danangRows = rows.filter((row) => row.branch_id === 'danang')
    const stats = aggregateSettlementStatusCounts(danangRows)
    const submittedCardCount = stats.find((s) => s.status === 'submitted')?.count
    const submittedFilteredTotal = countDashboardFilteredRows(rows, {
      regionId: 'danang',
      status: 'submitted',
    })

    expect(submittedCardCount).toBe(2)
    expect(submittedFilteredTotal).toBe(submittedCardCount)
  })

  it('leaves admin/master region scoping rules unchanged', () => {
    expect(
      resolveDashboardRegionFilter({
        role: 'admin',
        assignedRegionId: 'danang',
        requestedRegionId: 'phuquoc',
      }),
    ).toBe('danang')
    expect(
      resolveDashboardRegionFilter({
        role: 'master_admin',
        assignedRegionId: null,
        requestedRegionId: 'phuquoc',
      }),
    ).toBe('phuquoc')
    expect(
      resolveDashboardRegionFilter({
        role: 'master_admin',
        assignedRegionId: null,
      }),
    ).toBe('')
  })

  it('removes the old 처리 필요 정산서 dashboard section', () => {
    const source = readFileSync(join(ROOT, 'src/app/admin/page.tsx'), 'utf8')

    expect(source).not.toContain('처리 필요 정산서')
    expect(source).not.toContain('getAdminActionQueue')
    expect(source).toContain('정산서 목록')
  })
})
