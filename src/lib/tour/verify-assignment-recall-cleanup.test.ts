import { describe, expect, it } from 'vitest'
import {
  MARKER,
  TEST_MARKER_COLUMNS,
  buildManualCleanupSql,
  buildTestMarkerOrFilter,
  classifyVerificationOutcome,
  rowMatchesTestMarker,
} from '../../../scripts/assignment-recall-cleanup-report.mjs'

describe('rowMatchesTestMarker', () => {
  it('matches when any marker-bearing column contains the marker', () => {
    for (const col of TEST_MARKER_COLUMNS) {
      expect(rowMatchesTestMarker({ [col]: `${MARKER}-abc123` })).toBe(true)
    }
  })

  it('does not match real rows without the marker', () => {
    expect(
      rowMatchesTestMarker({
        tour_code: 'REAL-001',
        pattern: '하노이 3박',
        agency_name: '참좋은여행',
        tc_name: '김TC',
      }),
    ).toBe(false)
  })

  it('handles null/undefined rows and non-string fields safely', () => {
    expect(rowMatchesTestMarker(null)).toBe(false)
    expect(rowMatchesTestMarker(undefined)).toBe(false)
    expect(rowMatchesTestMarker({ tour_code: 123, pattern: null })).toBe(false)
  })
})

describe('buildTestMarkerOrFilter', () => {
  it('builds a case-insensitive PostgREST or-filter across all marker columns', () => {
    const filter = buildTestMarkerOrFilter()
    expect(filter).toBe(
      [
        `tour_code.ilike.%${MARKER}%`,
        `pattern.ilike.%${MARKER}%`,
        `agency_name.ilike.%${MARKER}%`,
        `tc_name.ilike.%${MARKER}%`,
      ].join(','),
    )
  })
})

describe('buildManualCleanupSql', () => {
  it('includes child-table, settlement, and tour deletes plus a transaction', () => {
    const sql = buildManualCleanupSql()
    expect(sql).toContain('BEGIN;')
    expect(sql).toContain('COMMIT;')
    expect(sql).toContain('UPDATE public.settlements s')
    expect(sql).toContain('DELETE FROM public.settlement_field_changes')
    expect(sql).toContain('DELETE FROM public.settlement_confirmations')
    expect(sql).toContain('DELETE FROM public.settlement_snapshots')
    expect(sql).toContain('DELETE FROM public.settlements')
    expect(sql).toContain('DELETE FROM public.tours')
    expect(sql).toContain(`tour_code ILIKE '%${MARKER}%'`)
  })

  it('orders settlement deletes before tour deletes', () => {
    const sql = buildManualCleanupSql()
    expect(sql.indexOf('DELETE FROM public.settlements\n')).toBeLessThan(
      sql.indexOf('DELETE FROM public.tours\n'),
    )
  })
})

describe('classifyVerificationOutcome', () => {
  it('reports cleanup completed when no rows remain and functional passed', () => {
    const outcome = classifyVerificationOutcome({
      functionalPassed: true,
      remainingTours: 0,
      remainingSettlements: 0,
    })
    expect(outcome.status).toBe('functional_passed_cleanup_completed')
    expect(outcome.cleanupComplete).toBe(true)
    expect(outcome.exitCode).toBe(0)
  })

  it('reports cleanup incomplete (but functional passed) when rows remain', () => {
    const outcome = classifyVerificationOutcome({
      functionalPassed: true,
      remainingTours: 20,
      remainingSettlements: 18,
    })
    expect(outcome.status).toBe('functional_passed_cleanup_incomplete')
    expect(outcome.cleanupComplete).toBe(false)
    expect(outcome.remainingTotal).toBe(38)
    // Cleanup being blocked must NOT fail functional verification, but must warn.
    expect(outcome.functionalPassed).toBe(true)
    expect(outcome.exitCode).toBe(2)
  })

  it('reports functional failure with exit 1 regardless of cleanup state', () => {
    const outcome = classifyVerificationOutcome({
      functionalPassed: false,
      remainingTours: 0,
      remainingSettlements: 0,
    })
    expect(outcome.status).toBe('functional_failed')
    expect(outcome.exitCode).toBe(1)
  })

  it('counts a single remaining settlement (no tours) as incomplete', () => {
    const outcome = classifyVerificationOutcome({
      functionalPassed: true,
      remainingTours: 0,
      remainingSettlements: 1,
    })
    expect(outcome.cleanupComplete).toBe(false)
    expect(outcome.exitCode).toBe(2)
  })
})
