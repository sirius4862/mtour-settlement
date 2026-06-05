import { describe, expect, it } from 'vitest'
import {
  filterMtourRegionBranches,
  formatRegionLabel,
  isMtourRegionCode,
  MTOUR_REGION_LABELS,
} from './regions'

describe('mtour regions', () => {
  it('recognizes operating region codes', () => {
    expect(isMtourRegionCode('HANOI')).toBe(true)
    expect(isMtourRegionCode('DANANG')).toBe(true)
    expect(isMtourRegionCode('GRAND_ACE')).toBe(true)
    expect(isMtourRegionCode('LEGACY')).toBe(false)
  })

  it('keeps Da Nang label unchanged', () => {
    expect(MTOUR_REGION_LABELS.DANANG).toBe('Da Nang')
  })

  it('formats region labels', () => {
    expect(formatRegionLabel('HANOI')).toBe(MTOUR_REGION_LABELS.HANOI)
    expect(formatRegionLabel('GRAND_ACE')).toBe('Grand Ace')
    expect(formatRegionLabel('UNKNOWN', 'Legacy Branch')).toBe('Legacy Branch')
  })

  it('filters and sorts known region branches', () => {
    const rows = filterMtourRegionBranches([
      { id: '3', code: 'PHUQUOC', name: 'Phu Quoc' },
      { id: '1', code: 'HANOI', name: 'Hanoi' },
      { id: '2', code: 'OTHER', name: 'Other' },
    ])
    expect(rows.map((r) => r.code)).toEqual(['HANOI', 'PHUQUOC'])
  })
})
