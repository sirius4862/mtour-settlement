import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { SAVE_SETTLEMENT_GENERIC_ERROR } from '@/lib/server/safe-errors'
import { calcSettlement } from './calc'
import { emptyMealRow, emptyOptionRow } from './defaults'
import { Q75_NEGATIVE_WARNING } from './display-labels'
import { emptyFormState, toCalcInput, toDraftPayload } from './mappers'
import { SETTLEMENT_DUPLICATE_TOUR_ERROR } from './status-guards'
import { calcSummaryFromResult } from './snapshot'
import { submitCurrentSettlement } from './submit-flow'
import { validateSettlementDraftPayload } from './server-payload-validation'
import { validateSettlementForm, validationErrors } from './validation'

const ROOT = join(process.cwd())

function readRepoFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

function negativeQ75FormState() {
  const state = {
    ...emptyFormState('가이드'),
    tourId: 'tour-1',
    tour: { id: 'tour-1', tour_code: 'NEG-Q75', start_date: '2026-06-01' } as never,
    exchange_rate: 26_000,
    header: {
      ...emptyFormState('가이드').header,
      advance_vnd: 500_000,
    },
    meals: [
      {
        ...emptyMealRow(),
        clientId: 'meal-heavy',
        restaurant_name: '고지출 식사',
        pax: 15,
        unit_price_vnd: 800_000,
      },
    ],
    options: [
      {
        ...emptyOptionRow(false),
        clientId: 'opt-1',
        option_name: '옵션',
        pax: 5,
        unit_price_usd: 30,
      },
    ],
  }

  const calc = calcSettlement(toCalcInput(state))

  expect(calc.sections.cash.company_deposit_usd.value).toBeLessThan(0)
  return { state, calc }
}

describe('negative company deposit policy (Q75)', () => {
  it('calc produces negative company_deposit_usd without clamping', () => {
    const { calc } = negativeQ75FormState()
    expect(calc.sections.cash.company_deposit_usd.value).toBeLessThan(0)
    expect(calc.sections.cash.company_deposit_usd.formula).toBe('J75−N75−P75')
  })

  it('1: draft save validation passes when Q75 is negative', () => {
    const { state } = negativeQ75FormState()
    const errors = validationErrors(validateSettlementForm(state, 'draft', 'guide'))
    expect(errors).toHaveLength(0)
  })

  it('2: save-before-submit validation passes when Q75 is negative and required fields are valid', () => {
    const { state } = negativeQ75FormState()
    const errors = validationErrors(validateSettlementForm(state, 'submit', 'guide'))
    expect(errors).toHaveLength(0)
  })

  it('3: Q75 warning can render but does not disable save/submit buttons', () => {
    const footer = readRepoFile('src/components/settlement/SettlementFormFooter.tsx')
    expect(footer).toContain('Q75_NEGATIVE_WARNING')
    expect(footer).toContain('q75IsNegative')
    expect(footer).toContain('disabled={pendingAction !== null}')
    expect(footer).not.toMatch(/disabled=\{[^}]*q75IsNegative/)
  })

  it('4: server draft payload validation accepts data that yields negative Q75', () => {
    const { state } = negativeQ75FormState()
    const payload = toDraftPayload(state)
    expect(validateSettlementDraftPayload(payload)).toEqual({ ok: true })
  })

  it('4b: calc summary preserves negative company_deposit_usd', () => {
    const { calc } = negativeQ75FormState()
    const summary = calcSummaryFromResult(calc)
    expect(summary.company_deposit_usd).toBeLessThan(0)
    expect(summary.company_deposit_usd).toBe(calc.sections.cash.company_deposit_usd.value)
  })

  it('2b: save-before-submit flow succeeds when underlying save/submit succeed', async () => {
    let storedId: string | null = null
    const saveDraft = vi.fn(async () => {
      storedId = 'settlement-negative-q75'
      return { ok: true as const }
    })

    const result = await submitCurrentSettlement({
      getSettlementId: () => storedId,
      saveDraft,
      submitWithDraft: vi.fn(async () => ({ ok: true })),
      submitSaved: vi.fn(async () => ({ ok: true })),
    })

    expect(result.ok).toBe(true)
    expect(saveDraft).toHaveBeenCalledTimes(1)
  })

  it('5: child item idempotency suite remains present', () => {
    expect(readRepoFile('src/lib/settlement/child-item-save-idempotency.test.ts')).toContain(
      'child item save idempotency',
    )
  })

  it('6: duplicate settlement guard remains intact', () => {
    expect(SETTLEMENT_DUPLICATE_TOUR_ERROR).toContain('이미 정산서')
    expect(readRepoFile('src/lib/actions/settlementActions.ts')).toContain(
      'SETTLEMENT_DUPLICATE_TOUR_ERROR',
    )
  })

  it('7: unrelated validation failures show specific messages, not Q75 blame', async () => {
    const result = await submitCurrentSettlement({
      getSettlementId: () => null,
      saveDraft: vi.fn(async () => ({
        ok: false as const,
        error: SAVE_SETTLEMENT_GENERIC_ERROR,
        saveStep: 'client_handle_save',
      })),
      submitWithDraft: vi.fn(),
      submitSaved: vi.fn(),
    })

    expect(result.error).toBe(SAVE_SETTLEMENT_GENERIC_ERROR)
    expect(result.error).not.toContain('회사입금')
    expect(result.error).not.toContain(Q75_NEGATIVE_WARNING)
    expect(result.error).not.toBe('제출 전 임시저장에 실패했습니다. 입력 내용을 확인해주세요.')
  })

  it('validation.ts and server-payload-validation do not gate Q75', () => {
    expect(readRepoFile('src/lib/settlement/validation.ts')).not.toContain('company_deposit')
    expect(readRepoFile('src/lib/settlement/server-payload-validation.ts')).not.toContain(
      'company_deposit',
    )
    expect(readRepoFile('src/lib/settlement/server-payload-validation.ts')).not.toMatch(
      /회사입금.*0 이상/,
    )
  })

  it('admin save uses the same server payload validation without Q75 gate', () => {
    const source = readRepoFile('src/lib/actions/settlementActions.ts')
    const adminStart = source.indexOf('export async function saveAdminSettlementEdits')
    const adminBody = source.slice(adminStart, adminStart + 800)
    expect(adminBody).toContain('validateSettlementDraftPayload')
    expect(adminBody).not.toContain('company_deposit')
  })
})
