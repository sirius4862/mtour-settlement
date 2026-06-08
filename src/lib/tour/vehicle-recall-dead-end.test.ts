import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assertCanRecallTourAssignment } from './assignment-recall'
import {
  canRetryVehicleCleanupRpcOnly,
  isFullRecallRetryBlocked,
  isVehicleRecallCleanupPending,
  isVehicleRecallDeadEnd,
  RECALL_TOUR_ASSIGNMENT_STEP_ORDER,
} from './vehicle-recall-dead-end'

const TOUR_ACTIONS_SRC = readFileSync('src/lib/actions/tourActions.ts', 'utf8')
const V2_SQL = readFileSync('supabase/vehicle_company_v2_profile_assignment.sql', 'utf8')

function recallActionBody(): string {
  const start = TOUR_ACTIONS_SRC.indexOf('export async function recallTourAssignment')
  return TOUR_ACTIONS_SRC.slice(start)
}

describe('C1 — recallTourAssignment step order (non-atomic)', () => {
  it('documents the three-step client-side sequence', () => {
    expect(RECALL_TOUR_ASSIGNMENT_STEP_ORDER).toEqual([
      'tour_assignment_status_to_recalled',
      'settlement_status_to_recalled_optional',
      'recall_tour_vehicle_cleanup_rpc',
    ])
  })

  it('recalls the tour before invoking vehicle cleanup RPC', () => {
    const body = recallActionBody()
    const tourRecallIdx = body.indexOf("assignment_status: 'recalled'")
    const rpcIdx = body.indexOf("'recall_tour_vehicle_cleanup'")
    expect(tourRecallIdx).toBeGreaterThan(-1)
    expect(rpcIdx).toBeGreaterThan(tourRecallIdx)
  })

  it('does not roll back tour recall when vehicle cleanup RPC fails', () => {
    const body = recallActionBody()
    expect(body).toContain('vehicleCleanupError')
    expect(body).toContain('배정은 회수되었으나 차량 리포트 정리에 실패했습니다')
    // No compensating update to assignment_status after RPC failure.
    const afterRpcError = body.slice(body.indexOf('vehicleCleanupError'))
    expect(afterRpcError).not.toMatch(/assignment_status:\s*'assigned'/)
    expect(afterRpcError).not.toContain('.rollback(')
  })

  it('tour recall update only matches currently-assigned tours', () => {
    const body = recallActionBody()
    expect(body).toMatch(/\.eq\('assignment_status',\s*'assigned'\)/)
  })
})

describe('C1 — retry blocked after partial failure', () => {
  it('assertCanRecallTourAssignment rejects already-recalled tours', () => {
    const result = assertCanRecallTourAssignment({
      role: 'admin',
      assignmentStatus: 'recalled',
      settlementStatus: 'recalled',
      guideConfirmedAt: null,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('이미 배정 회수된 투어')
    }
  })

  it('full recall retry is blocked once assignment_status is recalled', () => {
    expect(isFullRecallRetryBlocked('recalled')).toBe(true)
    expect(isFullRecallRetryBlocked('assigned')).toBe(false)
  })

  it('detects vehicle cleanup still pending after tour recall', () => {
    expect(
      isVehicleRecallCleanupPending({
        assignmentStatus: 'recalled',
        vehicleCompanyProfileId: 'profile-1',
        hasVehicleReport: false,
      }),
    ).toBe(true)
    expect(
      isVehicleRecallCleanupPending({
        assignmentStatus: 'recalled',
        vehicleCompanyProfileId: null,
        vehicleCompanyId: 'legacy-co-1',
        hasVehicleReport: false,
      }),
    ).toBe(true)
    expect(
      isVehicleRecallCleanupPending({
        assignmentStatus: 'recalled',
        vehicleCompanyProfileId: null,
        hasVehicleReport: true,
      }),
    ).toBe(true)
    expect(
      isVehicleRecallCleanupPending({
        assignmentStatus: 'recalled',
        vehicleCompanyProfileId: null,
        vehicleCompanyId: null,
        hasVehicleReport: false,
      }),
    ).toBe(false)
    expect(
      isVehicleRecallCleanupPending({
        assignmentStatus: 'assigned',
        vehicleCompanyProfileId: 'profile-1',
        hasVehicleReport: true,
      }),
    ).toBe(false)
  })

  it('identifies the C1 dead-end when recall committed but vehicle artifacts remain', () => {
    expect(
      isVehicleRecallDeadEnd({
        assignmentStatus: 'recalled',
        vehicleCompanyProfileId: 'profile-1',
        hasVehicleReport: true,
      }),
    ).toBe(true)
    expect(
      isVehicleRecallDeadEnd({
        assignmentStatus: 'recalled',
        vehicleCompanyProfileId: null,
        hasVehicleReport: false,
      }),
    ).toBe(false)
  })
})

describe('C1 — RPC-only retry path (recommended recovery)', () => {
  it('cleanup RPC requires an already-recalled tour', () => {
    expect(V2_SQL).toContain("assignment_status <> 'recalled'")
  })

  it('allows RPC-only retry when tour is already recalled', () => {
    expect(canRetryVehicleCleanupRpcOnly('recalled')).toBe(true)
    expect(canRetryVehicleCleanupRpcOnly('assigned')).toBe(false)
  })

  it('RPC delete + profile clear is idempotent on re-run', () => {
    expect(V2_SQL).toMatch(/DELETE FROM public\.vehicle_route_reports WHERE tour_id = p_tour_id/)
    expect(V2_SQL).toContain('vehicle_company_profile_id = NULL')
  })
})

describe('C1 — vehicle assignment lock coupling', () => {
  const ADMIN_ACTIONS_SRC = readFileSync('src/lib/actions/vehicleCompanyAdminActions.ts', 'utf8')

  it('manual assign/clear stays blocked while a report exists (recall-only delete)', () => {
    expect(ADMIN_ACTIONS_SRC).toContain('reportExistsForTour')
    expect(ADMIN_ACTIONS_SRC).not.toContain('recall_tour_vehicle_cleanup')
  })
})

describe('C1 — admin tour list cleanup retry eligibility (pure helper)', () => {
  it('canRetryVehicleCleanup delegates to isVehicleRecallCleanupPending', async () => {
    const { canRetryVehicleCleanup } = await import('@/lib/admin/tour-list')
    expect(
      canRetryVehicleCleanup({
        assignment_status: 'recalled',
        vehicle_company_profile_id: 'p1',
        has_vehicle_report: false,
      }),
    ).toBe(true)
    expect(
      canRetryVehicleCleanup({
        assignment_status: 'recalled',
        has_vehicle_report: false,
        vehicle_company_profile_id: null,
        vehicle_company_id: null,
      }),
    ).toBe(false)
  })
})

describe('C1 — Option 1 cleanup retry in recallTourAssignment (source)', () => {
  function recalledRetryBranch(): string {
    const body = recallActionBody()
    const start = body.indexOf("if (assignmentStatus === 'recalled')")
    const elseIdx = body.indexOf('} else {', start)
    return body.slice(start, elseIdx)
  }

  function normalRecallBranch(): string {
    const body = recallActionBody()
    const start = body.indexOf('} else {')
    const rpcIdx = body.indexOf("'recall_tour_vehicle_cleanup'", start)
    return body.slice(start, rpcIdx)
  }

  it('already-recalled tour with pending cleanup can invoke recall_tour_vehicle_cleanup', () => {
    const branch = recalledRetryBranch()
    expect(branch).toContain('isVehicleRecallCleanupPending')
    expect(branch).toContain('vehicle_route_reports')
    expect(branch).toContain('vehicle_company_profile_id')
    expect(branch).toContain('vehicle_company_id')
    expect(recallActionBody()).toContain("'recall_tour_vehicle_cleanup'")
  })

  it('already-recalled tour without pending cleanup returns the existing already-recalled error', () => {
    const branch = recalledRetryBranch()
    expect(branch).toContain('이미 배정 회수된 투어입니다.')
    expect(branch).not.toContain('assertCanRecallTourAssignment')
  })

  it('cleanup retry does not update settlement status', () => {
    const branch = recalledRetryBranch()
    expect(branch).not.toContain("status: 'recalled'")
    expect(branch).not.toContain('.from(\'settlements\')')
  })

  it('cleanup retry does not touch payout/calculation/paid-lock/guide confirmation', () => {
    const branch = recalledRetryBranch()
    expect(branch).not.toContain('paid_at')
    expect(branch).not.toContain('guide_confirmed_at')
    expect(branch).not.toContain('ground_fee')
    expect(branch).not.toContain('guide_daily_fee')
    expect(branch).not.toContain('guide_payout')
  })

  it('normal recall flow for assigned tours remains unchanged', () => {
    const branch = normalRecallBranch()
    expect(branch).toContain('assertCanRecallTourAssignment')
    expect(branch).toContain("assignment_status: 'recalled'")
    expect(branch).toContain("status: 'recalled'")
    expect(branch).toMatch(/\.eq\('assignment_status',\s*'assigned'\)/)
  })
})
