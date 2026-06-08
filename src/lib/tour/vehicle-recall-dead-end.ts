import type { TourAssignmentStatus } from '@/types'

/**
 * Vehicle-side state after recallTourAssignment step 1 may have committed.
 * Used to detect audit finding C1: non-atomic recall can dead-end when the
 * vehicle cleanup RPC fails after the tour is already recalled.
 */
export interface VehicleRecallPartialState {
  assignmentStatus: TourAssignmentStatus | null | undefined
  /** tours.vehicle_company_profile_id still set */
  vehicleCompanyProfileId: string | null | undefined
  /** Legacy tours.vehicle_company_id still set */
  vehicleCompanyId?: string | null | undefined
  /** At least one vehicle_route_reports row exists for the tour */
  hasVehicleReport: boolean
}

/** Step order in recallTourAssignment — tour recall always runs before vehicle RPC. */
export const RECALL_TOUR_ASSIGNMENT_STEP_ORDER = [
  'tour_assignment_status_to_recalled',
  'settlement_status_to_recalled_optional',
  'recall_tour_vehicle_cleanup_rpc',
] as const

export type RecallTourAssignmentStep = (typeof RECALL_TOUR_ASSIGNMENT_STEP_ORDER)[number]

/**
 * assertCanRecallTourAssignment blocks any tour already marked recalled.
 * Retry of the full recall action therefore cannot reach the cleanup RPC.
 */
export function isFullRecallRetryBlocked(
  assignmentStatus: TourAssignmentStatus | null | undefined,
): boolean {
  return assignmentStatus === 'recalled'
}

/**
 * Vehicle cleanup is still needed when the tour is recalled but vehicle artifacts
 * remain (report row and/or profile assignment).
 */
export function isVehicleRecallCleanupPending(state: VehicleRecallPartialState): boolean {
  if (state.assignmentStatus !== 'recalled') return false
  return (
    !!state.vehicleCompanyProfileId ||
    !!state.vehicleCompanyId ||
    state.hasVehicleReport
  )
}

/**
 * C1 dead-end: tour recall committed, vehicle cleanup did not, and the app guard
 * prevents re-invoking recallTourAssignment to retry the RPC.
 */
export function isVehicleRecallDeadEnd(state: VehicleRecallPartialState): boolean {
  return isFullRecallRetryBlocked(state.assignmentStatus) && isVehicleRecallCleanupPending(state)
}

/**
 * The cleanup RPC is designed to run only after recall (requires recalled tour).
 * It is idempotent: repeated DELETE/UPDATE is safe. A dedicated retry entry that
 * calls only the RPC can recover from C1 without re-running tour recall.
 */
export function canRetryVehicleCleanupRpcOnly(
  assignmentStatus: TourAssignmentStatus | null | undefined,
): boolean {
  return assignmentStatus === 'recalled'
}
