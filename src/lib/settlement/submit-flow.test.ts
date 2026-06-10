import { describe, expect, it, vi } from 'vitest'
import { submitCurrentSettlement } from './submit-flow'

describe('submitCurrentSettlement (H3: 저장 후 제출)', () => {
  it('submits a never-saved new settlement by saving first, then submitting the new id', async () => {
    let storedId: string | null = null
    const saveDraft = vi.fn(async () => {
      storedId = 'new-settlement-id'
      return { ok: true as const }
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
    expect(saveDraft).toHaveBeenCalledTimes(1)
    expect(submitWithDraft).not.toHaveBeenCalled()
    expect(submitSaved).toHaveBeenCalledTimes(1)
    expect(submitSaved).toHaveBeenCalledWith('new-settlement-id')
  })

  it('propagates the specific save error instead of a generic pre-save message', async () => {
    const saveDraft = vi.fn(async () => ({
      ok: false as const,
      error: '정산서 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      saveStep: 'client_handle_save',
    }))
    const submitSaved = vi.fn(async () => ({ ok: true }))
    const submitWithDraft = vi.fn(async () => ({ ok: true }))

    const result = await submitCurrentSettlement({
      getSettlementId: () => null,
      saveDraft,
      submitWithDraft,
      submitSaved,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('정산서 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    expect(submitSaved).not.toHaveBeenCalled()
    expect(submitWithDraft).not.toHaveBeenCalled()
  })

  it('falls back to a friendly pre-save message only when saveDraft omits an error', async () => {
    const saveDraft = vi.fn(async () => ({ ok: false as const }))
    const submitSaved = vi.fn(async () => ({ ok: true }))
    const submitWithDraft = vi.fn(async () => ({ ok: true }))

    const result = await submitCurrentSettlement({
      getSettlementId: () => null,
      saveDraft,
      submitWithDraft,
      submitSaved,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('제출 전 임시저장에 실패했습니다. 입력 내용을 확인해주세요.')
    expect(submitSaved).not.toHaveBeenCalled()
    expect(submitWithDraft).not.toHaveBeenCalled()
  })

  it('errors if no id is available even after a reportedly successful save', async () => {
    const saveDraft = vi.fn(async () => ({ ok: true as const }))
    const submitSaved = vi.fn(async () => ({ ok: true }))

    const result = await submitCurrentSettlement({
      getSettlementId: () => null,
      saveDraft,
      submitWithDraft: vi.fn(async () => ({ ok: true })),
      submitSaved,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('ID를 확인할 수 없습니다')
    expect(submitSaved).not.toHaveBeenCalled()
  })

  it('existing settlement submits with current edits in one call (no separate pre-save)', async () => {
    const saveDraft = vi.fn(async () => ({ ok: true as const }))
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
      saveDraft: vi.fn(async () => ({ ok: true as const })),
      submitWithDraft: vi.fn(async () => ({ ok: false, error: '제출 실패' })),
      submitSaved: vi.fn(async () => ({ ok: true })),
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('제출 실패')
  })
})
