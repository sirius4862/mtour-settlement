import { describe, expect, it } from 'vitest'
import { GUIDE_EDITABLE, canGuideEdit } from './index'

describe('canGuideEdit', () => {
  const guideId = 'guide-1'
  const otherId = 'guide-2'
  const base = { guide_id: guideId }

  it('allows draft, rejected, edit_requested for owner', () => {
    for (const status of GUIDE_EDITABLE) {
      expect(canGuideEdit({ ...base, status }, guideId)).toBe(true)
    }
  })

  it('denies submitted, confirmation, approved, paid for owner', () => {
    for (const status of [
      'submitted',
      'pending_guide_confirmation',
      'clarification_requested',
      'approved',
      'paid',
    ] as const) {
      expect(canGuideEdit({ ...base, status }, guideId)).toBe(false)
    }
  })

  it('denies all statuses for non-owner', () => {
    for (const status of [
      ...GUIDE_EDITABLE,
      'submitted',
      'pending_guide_confirmation',
      'clarification_requested',
      'approved',
      'paid',
    ] as const) {
      expect(canGuideEdit({ guide_id: otherId, status }, guideId)).toBe(false)
    }
  })
})
