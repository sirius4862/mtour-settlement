import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { SAVE_SETTLEMENT_GENERIC_ERROR } from '@/lib/server/safe-errors'
import { SETTLEMENT_DUPLICATE_TOUR_ERROR } from '@/lib/settlement/status-guards'
import { applyDraftSaveResult } from './draft-save-flow'
import { submitCurrentSettlement } from './submit-flow'
import { emptyEntranceRow, emptyMealRow, emptyOptionRow, emptyShoppingRow } from './defaults'
import { validateSettlementForm } from './validation'
import type { SettlementFormState } from './form-types'

function readRepoFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

function minimalGuideState(overrides: Partial<SettlementFormState> = {}): SettlementFormState {
  return {
    settlementId: null,
    tourId: 'tour-1',
    tour: { id: 'tour-1', tour_code: 'T-001', start_date: '2026-06-01' } as SettlementFormState['tour'],
    guideName: 'Guide',
    exchange_rate: 25000,
    header: {
      advance_vnd: 0,
      ground_fee_usd: 0,
      charming_other_usd: 0,
      tip_received_usd: 0,
      option_receivable_usd: 0,
      tip_transfer_usd: 0,
      option_credit_usd: 0,
      vehicle_fee_usd: 0,
      head_tax_usd: 0,
      seoul_biz_fee_usd: 0,
      tc_guide_usd: 0,
      tc_company_usd: 0,
      megugi_usd: 0,
      guide_daily_fee_usd: 0,
      settlement_ratio: 0.5,
      guide_note: null,
    },
    hotels: [],
    meals: [{ ...emptyMealRow(), clientId: 'm1', restaurant_name: 'Pho', pax: 2, unit_price_vnd: 100000 }],
    entrances: [],
    others: [],
    shoppings: [],
    options: [{ ...emptyOptionRow(false), clientId: 'o1', option_name: 'Boat', pax: 1, unit_price_usd: 10 }],
    companyExpenses: [],
    receipts: [],
    dirty: true,
    saveStatus: 'idle',
    saveError: null,
    lastSavedAt: null,
    ...overrides,
  } as SettlementFormState
}

describe('save-before-submit flow (guide new settlement)', () => {
  it('A: draft save path accepts meal/entrance/shopping/option rows for a new settlement', () => {
    const state = minimalGuideState({
      entrances: [{ ...emptyEntranceRow(), clientId: 'e1', attraction_name: 'Temple', pax: 3, unit_price_vnd: 50000 }],
      shoppings: [{ ...emptyShoppingRow(), clientId: 's1', shop_name: 'Silk', sale_usd: 20, com_usd: 2 }],
    })
    const draftIssues = validateSettlementForm(state, 'draft', 'guide')
    expect(draftIssues.filter((i) => i.severity === 'error')).toHaveLength(0)
  })

  it('B: submit validation passes when guide-owned line items exist', () => {
    const state = minimalGuideState()
    const submitIssues = validateSettlementForm(state, 'submit', 'guide')
    expect(submitIssues.filter((i) => i.severity === 'error')).toHaveLength(0)
  })

  it('C/D: negative company deposit (Q75) does not block draft or submit validation', () => {
    const state = minimalGuideState({
      meals: [{ ...emptyMealRow(), clientId: 'm1', restaurant_name: 'Big meal', pax: 10, unit_price_vnd: 5000000 }],
    })
    const draftErrors = validateSettlementForm(state, 'draft', 'guide').filter((i) => i.severity === 'error')
    const submitErrors = validateSettlementForm(state, 'submit', 'guide').filter((i) => i.severity === 'error')
    expect(draftErrors).toHaveLength(0)
    expect(submitErrors).toHaveLength(0)
    expect(readRepoFile('src/lib/settlement/validation.ts')).not.toContain('company_deposit')
    expect(readRepoFile('src/components/settlement/SettlementFormFooter.tsx')).toContain('Q75_NEGATIVE_WARNING')
  })

  it('C: save-before-submit surfaces server save errors instead of masking them', async () => {
    const saveDraft = vi.fn(async () => ({
      ok: false as const,
      error: SAVE_SETTLEMENT_GENERIC_ERROR,
      saveStep: 'client_handle_save',
    }))

    const result = await submitCurrentSettlement({
      getSettlementId: () => null,
      saveDraft,
      submitWithDraft: vi.fn(),
      submitSaved: vi.fn(),
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe(SAVE_SETTLEMENT_GENERIC_ERROR)
    expect(result.error).not.toBe('제출 전 임시저장에 실패했습니다. 입력 내용을 확인해주세요.')
  })

  it('E: save-before-submit binds settlement id and does not create duplicate rows on retry', async () => {
    const state = { settlementId: null as string | null }
    let inserts = 0
    let updates = 0

    const saveDraft = vi.fn(async () => {
      if (state.settlementId) {
        updates += 1
        return { ok: true as const }
      }
      inserts += 1
      applyDraftSaveResult(
        { ok: true, id: 'settlement-1' },
        {
          currentSettlementId: state.settlementId,
          bindSettlementId: (id) => {
            state.settlementId = id
          },
          markSaved: (id) => {
            state.settlementId = id
          },
          mergeServerSync: vi.fn(),
          setSaveError: vi.fn(),
        },
      )
      return { ok: true as const }
    })

    const first = await submitCurrentSettlement({
      getSettlementId: () => state.settlementId,
      saveDraft,
      submitWithDraft: vi.fn(),
      submitSaved: vi.fn(async () => ({ ok: true })),
    })

    expect(first.ok).toBe(true)
    expect(inserts).toBe(1)
    expect(updates).toBe(0)
    expect(state.settlementId).toBe('settlement-1')

    const second = await submitCurrentSettlement({
      getSettlementId: () => state.settlementId,
      saveDraft,
      submitWithDraft: vi.fn(async () => ({ ok: true })),
      submitSaved: vi.fn(),
    })

    expect(second.ok).toBe(true)
    expect(inserts).toBe(1)
    expect(updates).toBe(0)
    expect(saveDraft).toHaveBeenCalledTimes(1)
  })

  it('duplicate guard returns a specific message, not the generic pre-save fallback', async () => {
    const result = await submitCurrentSettlement({
      getSettlementId: () => null,
      saveDraft: vi.fn(async () => ({
        ok: false as const,
        error: SETTLEMENT_DUPLICATE_TOUR_ERROR,
        saveStep: 'client_handle_save',
      })),
      submitWithDraft: vi.fn(),
      submitSaved: vi.fn(),
    })

    expect(result.error).toBe(SETTLEMENT_DUPLICATE_TOUR_ERROR)
    expect(result.error).not.toBe('제출 전 임시저장에 실패했습니다. 입력 내용을 확인해주세요.')
  })

  it('F: child item idempotency tests remain in the suite', () => {
    expect(readRepoFile('src/lib/settlement/child-item-save-idempotency.test.ts')).toContain(
      'child item save idempotency',
    )
  })

  it('G: footer keeps submit pending label during save-before-submit and resets after failure', () => {
    const saveIntegrity = readRepoFile('src/lib/settlement/save-integrity.ts')
    expect(saveIntegrity).toContain("pendingAction === 'submit') return '저장 후 제출 중…'")
    expect(readRepoFile('src/components/settlement/SettlementFormFooter.tsx')).toContain(
      'footerStatusLabel',
    )
    expect(readRepoFile('src/components/settlement/SettlementForm.tsx')).toContain(
      "setPendingAction(null)",
    )
  })

  it('SettlementForm propagates saveDraft errors through submitCurrentSettlement', () => {
    const form = readRepoFile('src/components/settlement/SettlementForm.tsx')
    expect(form).toContain("action: 'save_then_submit'")
    expect(form).toContain('saveStep:')
    expect(form).toContain('getState().saveError')
    expect(form).toContain('logSubmitFlowAction')
  })
})
