import { describe, expect, it } from 'vitest'
import { canAdminAccessRegion, resolveAdminRegionFilter } from './permissions'

describe('admin region permissions', () => {
  it('master_admin can filter any region or all', () => {
    const scope = { role: 'master_admin' as const, assignedRegionId: null }
    expect(resolveAdminRegionFilter(scope)).toBeUndefined()
    expect(resolveAdminRegionFilter(scope, 'region-hanoi')).toBe('region-hanoi')
    expect(canAdminAccessRegion(scope, 'region-hanoi')).toBe(true)
  })

  it('admin is scoped to assigned region', () => {
    const scope = { role: 'admin' as const, assignedRegionId: 'region-danang' }
    expect(resolveAdminRegionFilter(scope)).toBe('region-danang')
    expect(resolveAdminRegionFilter(scope, 'region-hanoi')).toBe('region-danang')
    expect(canAdminAccessRegion(scope, 'region-danang')).toBe(true)
    expect(canAdminAccessRegion(scope, 'region-hanoi')).toBe(false)
  })
})
