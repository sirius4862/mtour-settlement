import { describe, expect, it, vi } from 'vitest'
import { submitCurrentSettlement } from './submit-flow'

describe('submitCurrentSettlement (H3: 저장 후 제출)', () => {
  it('submits a never-saved new settlement by saving first, then submitting the new id', async () => {
    let storedId: string | null = null
    const saveDraft = vi.fn(async () => {
      storedId = 'new-settlement-id'
      return true
    })
    const submitSaved = vi.fn(async () => ({ ok: true }))
    const submitWithDraft = vi.fn(async () => ({ ok: true }))

    const result = await submitCurrentSettlement({
      getSettlementId: () => storedId,
      saveDraft,
      submitWithDraft,
      submitSaved,
    })

    expect(result.ok).toBe(true)
    // Saved exactly once, no duplicate save via submit.
    expect(saveDraft).toHaveBeenCalledTimes(1)
    expect(submitWithDraft).not.toHaveBeenCalled()
    expect(submitSaved).toHaveBeenCalledTimes(1)
    expect(submitSaved).toHaveBeenCalledWith('new-settlement-id')
  })

  it('returns a friendly error and does not submit when the initial save fails', async () => {
    const saveDraft = vi.fn(async () => false)
    const submitSaved = vi.fn(async () => ({ ok: true }))
    const submitWithDraft = vi.fn(async () => ({ ok: true }))

    const result = await submitCurrentSettlement({
      getSettlementId: () => null,
      saveDraft,
      submitWithDraft,
      submitSaved,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(submitSaved).not.toHaveBeenCalled()
    expect(submitWithDraft).not.toHaveBeenCalled()
  })

  it('errors if no id is available even after a reportedly successful save', async () => {
    const saveDraft = vi.fn(async () => true)
    const submitSaved = vi.fn(async () => ({ ok: true }))

    const result = await submitCurrentSettlement({
      getSettlementId: () => null,
      saveDraft,
      submitWithDraft: vi.fn(async () => ({ ok: true })),
      submitSaved,
    })

    expect(result.ok).toBe(false)
    expect(submitSaved).not.toHaveBeenCalled()
  })

  it('existing settlement submits with current edits in one call (no separate pre-save)', async () => {
    const saveDraft = vi.fn(async () => true)
    const submitSaved = vi.fn(async () => ({ ok: true }))
    const submitWithDraft = vi.fn(async () => ({ ok: true }))

    const result = await submitCurrentSettlement({
      getSettlementId: () => 'existing-id',
      saveDraft,
      submitWithDraft,
      submitSaved,
    })

    expect(result.ok).toBe(true)
    expect(saveDraft).not.toHaveBeenCalled()
    expect(submitSaved).not.toHaveBeenCalled()
    expect(submitWithDraft).toHaveBeenCalledWith('existing-id')
  })

  it('propagates submit failure error to the caller', async () => {
    const result = await submitCurrentSettlement({
      getSettlementId: () => 'existing-id',
      saveDraft: vi.fn(async () => true),
      submitWithDraft: vi.fn(async () => ({ ok: false, error: '제출 실패' })),
      submitSaved: vi.fn(async () => ({ ok: true })),
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('제출 실패')
  })
})
