import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Source-level verification: the vehicle recall cleanup is wired into the EXISTING
// guide assignment-recall path and is performed by an admin-gated SECURITY DEFINER
// RPC, with zero impact on settlement calculation/payout/status/paid-lock/confirm.

const TOUR_ACTIONS_SRC = readFileSync('src/lib/actions/tourActions.ts', 'utf8')
const RPC_SQL = readFileSync('supabase/vehicle_company_v1_2_recall_cleanup_rpc.sql', 'utf8')
const STEP2_SQL = readFileSync('supabase/vehicle_company_v1_step2_schema.sql', 'utf8')
const ADMIN_ACTIONS_SRC = readFileSync('src/lib/actions/vehicleCompanyAdminActions.ts', 'utf8')

/** Executable SQL only — strip `--` comment lines so prose never trips assertions. */
const RPC_SQL_EXEC = RPC_SQL.split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')

/** The recall function body, isolated so assertions can't leak into other actions. */
function recallActionBody(): string {
  const start = TOUR_ACTIONS_SRC.indexOf('export async function recallTourAssignment')
  expect(start).toBeGreaterThan(-1)
  return TOUR_ACTIONS_SRC.slice(start)
}

describe('recall cleanup wiring (inside existing recall path)', () => {
  it('recallTourAssignment invokes the cleanup RPC (single, in-path)', () => {
    const body = recallActionBody()
    expect(body).toMatch(/\.rpc\(\s*'recall_tour_vehicle_cleanup'/)
    expect(body).toContain('p_tour_id: tourId')
    // Exactly one cleanup call, and it lives in the recall action (not a new path).
    const calls = TOUR_ACTIONS_SRC.split("'recall_tour_vehicle_cleanup'").length - 1
    expect(calls).toBe(1)
  })

  it('keeps the existing recall eligibility guard', () => {
    const body = recallActionBody()
    expect(body).toContain('assertCanRecallTourAssignment')
  })

  it('revalidates the vehicle views after recall', () => {
    const body = recallActionBody()
    expect(body).toContain("revalidatePath('/admin/vehicle-assignments')")
    expect(body).toContain("revalidatePath('/vehicle')")
  })
})

describe('recall cleanup RPC (SQL, Option C — no standing DELETE grant)', () => {
  it('is an admin-gated SECURITY DEFINER function', () => {
    expect(RPC_SQL).toContain('CREATE OR REPLACE FUNCTION public.recall_tour_vehicle_cleanup')
    expect(RPC_SQL).toContain('SECURITY DEFINER')
    expect(RPC_SQL).toContain('auth_user_is_admin_tier()')
  })

  it('runs only for an already-recalled tour (preserves eligibility ordering)', () => {
    expect(RPC_SQL).toContain("assignment_status <> 'recalled'")
  })

  it('clears tours.vehicle_company_id', () => {
    expect(RPC_SQL).toMatch(/UPDATE public\.tours SET vehicle_company_id = NULL/)
  })

  it('deletes vehicle_route_reports for the tour', () => {
    expect(RPC_SQL).toMatch(/DELETE FROM public\.vehicle_route_reports WHERE tour_id = p_tour_id/)
  })

  it('does NOT grant a standing DELETE on vehicle_route_reports to authenticated', () => {
    // No GRANT statement may include the DELETE privilege (only EXECUTE on the fn).
    expect(RPC_SQL_EXEC).not.toMatch(/GRANT[^;]*\bDELETE\b/i)
    expect(RPC_SQL).toContain('REVOKE DELETE ON TABLE public.vehicle_route_reports FROM authenticated')
    expect(RPC_SQL).toContain('GRANT EXECUTE ON FUNCTION public.recall_tour_vehicle_cleanup(uuid) TO authenticated')
    expect(RPC_SQL).toContain('REVOKE ALL ON FUNCTION public.recall_tour_vehicle_cleanup(uuid) FROM PUBLIC')
  })

  it('is idempotent / safe to re-run', () => {
    expect(RPC_SQL).toContain('CREATE OR REPLACE FUNCTION')
    expect(RPC_SQL).toContain('BEGIN;')
    expect(RPC_SQL).toContain('COMMIT;')
  })

  it('does not touch settlement money / status / paid-lock / confirmation', () => {
    expect(RPC_SQL_EXEC).not.toMatch(/UPDATE public\.settlements/)
    expect(RPC_SQL_EXEC).not.toContain('paid_at')
    expect(RPC_SQL_EXEC).not.toContain('guide_confirmed_at')
    expect(RPC_SQL_EXEC).not.toContain('settlement_status')
    expect(RPC_SQL_EXEC).not.toMatch(/guide_payout|company_profit|ground_fee/)
  })
})

describe('cascade + reassignment guarantees (Phase 1 schema)', () => {
  it('vehicle_report_checks are removed via ON DELETE CASCADE from the report', () => {
    expect(STEP2_SQL).toMatch(
      /report_id\s+uuid NOT NULL REFERENCES public\.vehicle_route_reports\(id\) ON DELETE CASCADE/,
    )
  })

  it('deleting the report frees UNIQUE(tour_id) so a new report can be created', () => {
    expect(STEP2_SQL).toContain('vehicle_route_reports_tour_id_key UNIQUE (tour_id)')
    // The cleanup deletes the report, releasing the unique slot for reassignment.
    expect(RPC_SQL).toContain('DELETE FROM public.vehicle_route_reports')
  })
})

describe('manual assignment stays blocked when a report exists', () => {
  it('assign/clear are guarded by report existence (only recall deletes)', () => {
    expect(ADMIN_ACTIONS_SRC).toContain('reportExistsForTour')
    expect(ADMIN_ACTIONS_SRC).toContain('VEHICLE_ASSIGNMENT_LOCKED_MESSAGE')
    // The admin actions never delete reports themselves — that is recall-only.
    expect(ADMIN_ACTIONS_SRC).not.toMatch(/from\(['"]vehicle_route_reports['"]\)[\s\S]*?\.delete\(\)/)
    expect(ADMIN_ACTIONS_SRC).not.toContain('recall_tour_vehicle_cleanup')
  })
})
