import { describe, expect, it, vi } from 'vitest'
import { applyDraftSaveResult, type DraftSaveActionResult } from './draft-save-flow'
import { submitCurrentSettlement } from './submit-flow'

function createHarness(initialSettlementId: string | null = null) {
  const state = { settlementId: initialSettlementId }
  const handlers = {
    currentSettlementId: state.settlementId,
    bindSettlementId: vi.fn((id: string) => {
      state.settlementId = id
    }),
    markSaved: vi.fn((id: string) => {
      state.settlementId = id
    }),
    mergeServerSync: vi.fn(),
    setSaveError: vi.fn(),
  }

  const apply = (result: DraftSaveActionResult) => {
    handlers.currentSettlementId = state.settlementId
    return applyDraftSaveResult(result, handlers)
  }

  return { state, handlers, apply }
}

describe('applyDraftSaveResult', () => {
  it('creating a new settlement from a clean tour tracks one created row', () => {
    const h = createHarness()
    let inserts = 0
    let updates = 0

    const save = () => {
      if (h.state.settlementId) {
        updates += 1
        return { ok: true, id: h.state.settlementId }
      }
      inserts += 1
      return { ok: true, id: 'settlement-1' }
    }

    const result = h.apply(save())

    expect(result).toEqual({
      ok: true,
      settlementId: 'settlement-1',
      becameExistingSettlement: true,
    })
    expect(h.state.settlementId).toBe('settlement-1')
    expect(inserts).toBe(1)
    expect(updates).toBe(0)
    expect(h.handlers.markSaved).toHaveBeenCalledWith('settlement-1')
  })

  it('save draft then save again updates the same settlement instead of inserting a duplicate', () => {
    const h = createHarness()
    let inserts = 0
    let updates = 0

    const save = () => {
      if (h.state.settlementId) {
        updates += 1
        return { ok: true, id: h.state.settlementId }
      }
      inserts += 1
      return { ok: true, id: 'settlement-1' }
    }

    h.apply(save())
    h.apply(save())

    expect(h.state.settlementId).toBe('settlement-1')
    expect(inserts).toBe(1)
    expect(updates).toBe(1)
  })

  it('save-and-submit from a clean new settlement does not attempt duplicate creation', async () => {
    const h = createHarness()
    let inserts = 0
    let updates = 0
    const saveDraft = vi.fn(async () => {
      if (h.state.settlementId) {
        updates += 1
        h.apply({ ok: true, id: h.state.settlementId })
        return { ok: true as const }
      }
      inserts += 1
      h.apply({ ok: true, id: 'settlement-1' })
      return { ok: true as const }
    })
    const submitSaved = vi.fn(async () => ({ ok: true }))
    const submitWithDraft = vi.fn(async () => ({ ok: true }))

    const result = await submitCurrentSettlement({
      getSettlementId: () => h.state.settlementId,
      saveDraft,
      submitSaved,
      submitWithDraft,
    })

    expect(result.ok).toBe(true)
    expect(inserts).toBe(1)
    expect(updates).toBe(0)
    expect(saveDraft).toHaveBeenCalledTimes(1)
    expect(submitSaved).toHaveBeenCalledWith('settlement-1')
    expect(submitWithDraft).not.toHaveBeenCalled()
  })

  it('if create succeeds but a later save step fails, retry updates the created settlement id', () => {
    const h = createHarness()
    let inserts = 0
    let updates = 0

    const firstSave = () => {
      inserts += 1
      return { ok: false, id: 'settlement-1', error: 'line item save failed' }
    }
    const retrySave = () => {
      if (h.state.settlementId) {
        updates += 1
        return { ok: true, id: h.state.settlementId }
      }
      inserts += 1
      return { ok: true, id: 'settlement-2' }
    }

    const failed = h.apply(firstSave())
    const retried = h.apply(retrySave())

    expect(failed.ok).toBe(false)
    expect(failed.settlementId).toBe('settlement-1')
    expect(h.handlers.setSaveError).toHaveBeenCalledWith('line item save failed')
    expect(retried.ok).toBe(true)
    expect(h.state.settlementId).toBe('settlement-1')
    expect(inserts).toBe(1)
    expect(updates).toBe(1)
  })

  it('duplicate guard recovery binds the existing id but keeps the save blocked', () => {
    const h = createHarness()

    const result = h.apply({
      ok: false,
      id: 'existing-settlement',
      error: '이 투어에는 이미 정산서가 있습니다. 기존 정산서를 열어주세요.',
    })

    expect(result).toEqual({
      ok: false,
      settlementId: 'existing-settlement',
      becameExistingSettlement: true,
    })
    expect(h.state.settlementId).toBe('existing-settlement')
    expect(h.handlers.markSaved).not.toHaveBeenCalled()
    expect(h.handlers.setSaveError).toHaveBeenCalledWith(
      '이 투어에는 이미 정산서가 있습니다. 기존 정산서를 열어주세요.',
    )
  })

  it('existing settlement edit remains an update of the current id', () => {
    const h = createHarness('settlement-1')

    const result = h.apply({ ok: true, id: 'settlement-1' })

    expect(result).toEqual({
      ok: true,
      settlementId: 'settlement-1',
      becameExistingSettlement: false,
    })
    expect(h.state.settlementId).toBe('settlement-1')
    expect(h.handlers.markSaved).toHaveBeenCalledWith('settlement-1')
  })
})
