/**
 * Documents admin settlement server actions guarded by settlements.branch_id.
 * Logic tests live in settlement-access.test.ts; actions call requireAdminSettlementRegionAccess.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ACTIONS_PATH = join(process.cwd(), 'src/lib/actions/settlementActions.ts')

describe('settlementActions admin region enforcement wiring', () => {
  const source = readFileSync(ACTIONS_PATH, 'utf8')

  it('getSettlementFull applies evaluateAdminSettlementReadAccess', () => {
    expect(source).toContain('evaluateAdminSettlementReadAccess')
  })

  it('saveAdminSettlementEdits calls requireAdminSettlementRegionAccess', () => {
    expect(source).toMatch(/export async function saveAdminSettlementEdits[\s\S]*?requireAdminSettlementRegionAccess/)
  })

  it('reviewSettlement calls requireAdminSettlementRegionAccess', () => {
    expect(source).toMatch(/export async function reviewSettlement[\s\S]*?requireAdminSettlementRegionAccess/)
  })

  it('sendForConfirmation calls requireAdminSettlementRegionAccess', () => {
    expect(source).toMatch(/export async function sendForConfirmation[\s\S]*?requireAdminSettlementRegionAccess/)
  })
})
