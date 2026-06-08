// ============================================================================
// Vehicle report dashboard status — pure label/derivation helpers (no I/O).
// List-level status for the vehicle company side is intentionally simple:
//   none      → 작성 가능   (no report yet)
//   draft     → 작성중      (draft exists)
//   submitted → 제출완료    (locked / read-only)
// ============================================================================

export type VehicleTourReportStatus = 'none' | 'draft' | 'submitted'

export function vehicleReportStatusLabel(status: VehicleTourReportStatus): string {
  switch (status) {
    case 'submitted':
      return '제출완료'
    case 'draft':
      return '작성중'
    case 'none':
    default:
      return '작성 가능'
  }
}

export function vehicleReportActionLabel(status: VehicleTourReportStatus): string {
  switch (status) {
    case 'submitted':
      return '제출완료 보기'
    case 'draft':
      return '리포트 수정'
    case 'none':
    default:
      return '리포트 작성'
  }
}

/** A report row is editable by the vehicle company only while it is not submitted. */
export function isVehicleReportEditable(status: VehicleTourReportStatus): boolean {
  return status !== 'submitted'
}
