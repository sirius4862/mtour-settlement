import { describe, expect, it } from 'vitest'
import {
  vehicleDashboardGuideCheckLabel,
  vehicleDashboardIssueNotePreview,
  vehicleDashboardReportStatusLabel,
} from './vehicle-dashboard-status'

describe('vehicle dashboard status labels', () => {
  it('maps report status for vehicle company list', () => {
    expect(vehicleDashboardReportStatusLabel('none')).toBe('작성 가능')
    expect(vehicleDashboardReportStatusLabel('draft')).toBe('임시저장')
    expect(vehicleDashboardReportStatusLabel('submitted')).toBe('제출 완료')
  })

  it('shows guide check only for submitted reports', () => {
    expect(
      vehicleDashboardGuideCheckLabel({ report_status: 'draft', check_status: null }),
    ).toBeNull()
    expect(
      vehicleDashboardGuideCheckLabel({ report_status: 'none', check_status: null }),
    ).toBeNull()
  })

  it('shows 가이드 미확인 when submitted without a check row', () => {
    expect(
      vehicleDashboardGuideCheckLabel({ report_status: 'submitted', check_status: null }),
    ).toBe('가이드 미확인')
  })

  it('shows guide checked · no issue', () => {
    expect(
      vehicleDashboardGuideCheckLabel({
        report_status: 'submitted',
        check_status: 'no_issue',
      }),
    ).toBe('가이드 확인 완료 · 이상없음')
  })

  it('shows guide checked · issue', () => {
    expect(
      vehicleDashboardGuideCheckLabel({
        report_status: 'submitted',
        check_status: 'issue_reported',
        issue_note: 'route mismatch',
      }),
    ).toBe('가이드 확인 완료 · 이상있음')
  })

  it('previews issue memo on the list card', () => {
    expect(vehicleDashboardIssueNotePreview('short note')).toBe('short note')
    expect(vehicleDashboardIssueNotePreview('x'.repeat(100), 80)?.endsWith('…')).toBe(true)
    expect(vehicleDashboardIssueNotePreview('   ')).toBeNull()
  })
})
