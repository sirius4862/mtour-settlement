import { describe, expect, it } from 'vitest'
import {
  buildVehicleAssignmentTourListItems,
  filterVehicleAssignmentToursByScope,
} from './admin-assignment-list'

const DANANG = 'branch-danang'
const HANOI = 'branch-hanoi'

describe('buildVehicleAssignmentTourListItems', () => {
  it('includes unassigned tour with null vehicle_company_profile_id', () => {
    const items = buildVehicleAssignmentTourListItems(
      [{
        id: 't-new',
        tour_code: '260608',
        start_date: '2026-06-08',
        end_date: '2026-06-10',
        branch_id: DANANG,
        vehicle_company_profile_id: null,
        guide_name: 'Guide A',
      }],
      new Map(),
      new Map(),
    )
    expect(items).toHaveLength(1)
    expect(items[0].vehicle_company_profile_id).toBeNull()
    expect(items[0].report_status).toBe('none')
    expect(items[0].assignment_status).toBe('unassigned')
    expect(items[0].vehicle_company_name).toBeNull()
  })

  it('includes tour without a vehicle_route_reports row', () => {
    const items = buildVehicleAssignmentTourListItems(
      [{
        id: 't-no-report',
        tour_code: '260608',
        start_date: '2026-06-08',
        end_date: null,
        branch_id: DANANG,
        vehicle_company_profile_id: null,
        guide_name: null,
      }],
      new Map(),
      new Map(),
    )
    expect(items[0].report_status).toBe('none')
    expect(items[0].assignment_status).toBe('unassigned')
  })

  it('enriches assigned tour with report status when report exists', () => {
    const profileId = 'vc-profile-1'
    const items = buildVehicleAssignmentTourListItems(
      [{
        id: 't1',
        tour_code: '260403',
        start_date: '2026-04-03',
        end_date: null,
        branch_id: DANANG,
        vehicle_company_profile_id: profileId,
        guide_name: 'G',
      }],
      new Map([['t1', 'draft']]),
      new Map([[profileId, 'Hanna Transport']]),
    )
    expect(items[0].assignment_status).toBe('draft')
    expect(items[0].report_status).toBe('draft')
    expect(items[0].vehicle_company_name).toBe('Hanna Transport')
  })
})

describe('filterVehicleAssignmentToursByScope', () => {
  const tours = [
    { id: '1', branch_id: DANANG, tour_code: '260608' },
    { id: '2', branch_id: HANOI, tour_code: '260417' },
  ]

  it('branch admin sees same-branch tours only', () => {
    const visible = filterVehicleAssignmentToursByScope(tours, {
      role: 'admin',
      assignedRegionId: DANANG,
    })
    expect(visible.map((t) => t.tour_code)).toEqual(['260608'])
  })

  it('branch admin does not see other-branch tours', () => {
    const visible = filterVehicleAssignmentToursByScope(tours, {
      role: 'admin',
      assignedRegionId: DANANG,
    })
    expect(visible.some((t) => t.branch_id === HANOI)).toBe(false)
  })

  it('master_admin sees all branches', () => {
    const visible = filterVehicleAssignmentToursByScope(tours, {
      role: 'master_admin',
      assignedRegionId: DANANG,
    })
    expect(visible).toHaveLength(2)
  })
})
