import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const BUTTON_SRC = readFileSync('src/app/admin/tours/VehicleCleanupRetryButton.tsx', 'utf8')

describe('VehicleCleanupRetryButton', () => {
  it('calls recallTourAssignment for cleanup-only retry', () => {
    expect(BUTTON_SRC).toContain('recallTourAssignment')
    expect(BUTTON_SRC).toContain('차량 리포트 정리 재시도')
    expect(BUTTON_SRC).toContain('차량 리포트 정리가 완료되었습니다.')
    expect(BUTTON_SRC).toContain('차량 리포트 정리에 실패했습니다.')
  })

  it('does not import settlement or vehicle report mutation modules', () => {
    expect(BUTTON_SRC).not.toContain('settlementActions')
    expect(BUTTON_SRC).not.toContain('vehicleReportActions')
    expect(BUTTON_SRC).not.toContain('.rpc(')
  })
})
