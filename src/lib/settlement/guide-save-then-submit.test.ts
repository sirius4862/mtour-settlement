import { describe, expect, it, vi } from 'vitest'
import { buildOtherDbRows } from './mappers'
import { explicitDeleteIdsFromDraft } from './guide-line-item-persist'
import { runGuideSaveThenSubmit } from './guide-save-then-submit'

const DUPLICATE_DESC = 'WORKFLOW_V1_TEST-dup-parking'
const CORRECTED_NOTE = 'WORKFLOW_V1_TEST-corrected-note'

describe('guide correction save-then-submit payload (Scenario A)', () => {
  it('removes soft-deleted duplicate other row and keeps corrected note for persist', () => {
    const settlementId = 'settlement-scenario-a'
    const others = [
      {
        clientId: 'keep',
        id: 'id-keep',
        description: DUPLICATE_DESC,
        amount_usd: 25,
        amount_vnd: 0,
        note: CORRECTED_NOTE,
      },
      {
        clientId: 'extra',
        id: 'id-extra',
        description: `${DUPLICATE_DESC}-extra`,
        amount_usd: 15,
        amount_vnd: 0,
        note: null,
        deleted: true,
      },
    ]

    expect(explicitDeleteIdsFromDraft(others)).toEqual(['id-extra'])
    const dbRows = buildOtherDbRows(others, settlementId)
    expect(dbRows).toHaveLength(1)
    expect(dbRows[0]?.description).toBe(DUPLICATE_DESC)
    expect(dbRows[0]?.note).toBe(CORRECTED_NOTE)
    expect(dbRows.some((r) => r.description === `${DUPLICATE_DESC}-extra`)).toBe(false)
  })
})

describe('runGuideSaveThenSubmit', () => {
  it('Scenario B: does not submit when save fails', async () => {
    const save = vi.fn().mockResolvedValue(false)
    const submit = vi.fn().mockResolvedValue({ ok: true })

    const result = await runGuideSaveThenSubmit({
      save,
      submit,
      getSettlementId: () => 'settlement-1',
    })

    expect(result).toEqual({ ok: false, phase: 'save', error: 'save_failed' })
    expect(save).toHaveBeenCalledTimes(1)
    expect(submit).not.toHaveBeenCalled()
  })

  it('calls submit only after successful save', async () => {
    const order: string[] = []
    const save = vi.fn(async () => {
      order.push('save')
      return true
    })
    const submit = vi.fn(async () => {
      order.push('submit')
      return { ok: true }
    })

    const result = await runGuideSaveThenSubmit({
      save,
      submit,
      getSettlementId: () => 'settlement-1',
    })

    expect(result).toEqual({ ok: true })
    expect(order).toEqual(['save', 'submit'])
  })

  it('returns submit phase error when submit fails after save', async () => {
    const save = vi.fn().mockResolvedValue(true)
    const submit = vi.fn().mockResolvedValue({ ok: false, error: '제출 실패' })

    const result = await runGuideSaveThenSubmit({
      save,
      submit,
      getSettlementId: () => 'settlement-1',
    })

    expect(result).toEqual({ ok: false, phase: 'submit', error: '제출 실패' })
    expect(save).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledWith('settlement-1')
  })
})
