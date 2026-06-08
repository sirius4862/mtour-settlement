/**
 * Pure, dependency-free cleanup-reporting helpers for the production assignment
 * recall verification script. Kept separate from the script's Supabase I/O so the
 * reporting logic is unit-testable without loading the Supabase client.
 */

/** Test-data marker stamped onto fixtures created by the verification script. */
export const MARKER = 'ASSIGN_RECALL_VERIFY'

/** Tour columns that may carry the ASSIGN_RECALL_VERIFY test marker. */
export const TEST_MARKER_COLUMNS = ['tour_code', 'pattern', 'agency_name', 'tc_name']

/** True when any marker-bearing column of a tour row contains the marker. */
export function rowMatchesTestMarker(row, marker = MARKER) {
  if (!row) return false
  return TEST_MARKER_COLUMNS.some((col) => {
    const value = row[col]
    return typeof value === 'string' && value.includes(marker)
  })
}

/** PostgREST `.or()` filter matching any marker-bearing column (case-insensitive). */
export function buildTestMarkerOrFilter(marker = MARKER) {
  return TEST_MARKER_COLUMNS.map((col) => `${col}.ilike.%${marker}%`).join(',')
}

/**
 * Manual SQL to remove leftover test data with the postgres role (bypasses RLS).
 * Mirrors the client-side cleanup order: null settlement FKs, delete child rows,
 * delete settlements, then tours.
 */
export function buildManualCleanupSql(marker = MARKER) {
  const tourWhere = TEST_MARKER_COLUMNS.map((col) => `${col} ILIKE '%${marker}%'`).join(
    '\n     OR ',
  )
  const tourWhereT = TEST_MARKER_COLUMNS.map((col) => `t.${col} ILIKE '%${marker}%'`).join(
    '\n     OR ',
  )
  const childDelete = (table) =>
    `DELETE FROM public.${table}\n` +
    `WHERE settlement_id IN (\n` +
    `  SELECT s.id FROM public.settlements s\n` +
    `  JOIN public.tours t ON t.id = s.tour_id\n` +
    `  WHERE ${tourWhereT}\n` +
    `);`
  return [
    `-- Manual ${marker} cleanup — run in Supabase Production SQL Editor.`,
    `-- The postgres role bypasses RLS; authenticated admin/master clients cannot`,
    `-- DELETE tours/settlements (there is no DELETE RLS policy), so deletes from`,
    `-- the verification script can silently affect 0 rows.`,
    'BEGIN;',
    '',
    'UPDATE public.settlements s',
    'SET guide_submit_snapshot_id = NULL, active_confirmation_id = NULL',
    `WHERE s.tour_id IN (\n  SELECT id FROM public.tours\n  WHERE ${tourWhere}\n);`,
    '',
    childDelete('settlement_field_changes'),
    '',
    childDelete('settlement_confirmations'),
    '',
    childDelete('settlement_snapshots'),
    '',
    `DELETE FROM public.settlements\nWHERE tour_id IN (\n  SELECT id FROM public.tours\n  WHERE ${tourWhere}\n);`,
    '',
    `DELETE FROM public.tours\nWHERE ${tourWhere};`,
    '',
    'COMMIT;',
  ].join('\n')
}

/**
 * Final result classification. Distinguishes the three reportable states and
 * never fails functional verification merely because cleanup was blocked:
 *   functional_failed                    → exit 1
 *   functional_passed_cleanup_completed  → exit 0
 *   functional_passed_cleanup_incomplete → exit 2 (cleanup warning only)
 */
export function classifyVerificationOutcome({
  functionalPassed,
  remainingTours = 0,
  remainingSettlements = 0,
}) {
  const remainingTotal = remainingTours + remainingSettlements
  const cleanupComplete = remainingTotal === 0
  let status
  let exitCode
  if (!functionalPassed) {
    status = 'functional_failed'
    exitCode = 1
  } else if (cleanupComplete) {
    status = 'functional_passed_cleanup_completed'
    exitCode = 0
  } else {
    status = 'functional_passed_cleanup_incomplete'
    exitCode = 2
  }
  return {
    functionalPassed,
    cleanupComplete,
    remainingTours,
    remainingSettlements,
    remainingTotal,
    status,
    exitCode,
  }
}
