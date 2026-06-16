import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { emptyEntranceRow, emptyOptionRow } from './defaults'
import { calcOptionRowComUsd } from './calc'
import { buildOptionDbRows, toDraftPayload } from './mappers'
import { applyDraftSaveResult } from './draft-save-flow'
import type { SettlementFormState } from './form-types'

const RATE = 26000

function minimalState(overrides: Partial<SettlementFormState>): SettlementFormState {
  return {
    settlementId: null,
    tourId: 'tour-1',
    tour: null,
    guideName: 'guide',
    exchange_rate: RATE,
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
      settlement_ratio: 0,
      guide_note: null,
    },
    hotels: [],
    meals: [],
    entrances: [],
    others: [],
    companyExpenses: [],
    shoppings: [],
    options: [],
    receipts: [],
    settlementStatus: null,
    guideSubmitSnapshotId: null,
    dirty: true,
    saveStatus: 'idle',
    lastSavedAt: null,
    saveError: null,
    ...overrides,
  }
}

describe('line-item date client state', () => {
  it('toDraftPayload serializes option and entrance dates as YYYY-MM-DD strings', () => {
    const state = minimalState({
      options: [
        {
          ...emptyOptionRow(),
          clientId: 'o1',
          option_date: '2026-04-06',
          option_name: 'test',
        },
      ],
      entrances: [
        {
          ...emptyEntranceRow(),
          clientId: 'e1',
          visit_date: '2026-04-07',
          attraction_name: '호이안야경',
        },
      ],
    })
    const payload = toDraftPayload(state)
    expect(payload.options[0]?.option_date).toBe('2026-04-06')
    expect(payload.entrances[0]?.visit_date).toBe('2026-04-07')
  })

  it('all line-item sections use the same ManualField date binding pattern', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/settlement/sections/LineItemSections.tsx'),
      'utf8',
    )
    for (const field of ['meal_date', 'visit_date', 'option_date']) {
      expect(src).toContain(`${field} ?? ''`)
      expect(src).toContain(`{ ${field}: e.target.value || null }`)
    }
  })
})

describe('failed child persist must not show false saved state', () => {
  it('applyDraftSaveResult keeps save blocked when header id exists but child persist failed', () => {
    const markSaved = vi.fn()
    const setSaveError = vi.fn()
    const result = applyDraftSaveResult(
      { ok: false, id: 'e5023526-99cf-4794-ac22-382b2ceac891', error: '옵션 COM 실패' },
      {
        currentSettlementId: null,
        bindSettlementId: () => {},
        markSaved,
        mergeServerSync: () => {},
        setSaveError,
      },
    )
    expect(result.ok).toBe(false)
    expect(markSaved).not.toHaveBeenCalled()
    expect(setSaveError).toHaveBeenCalledWith('옵션 COM 실패')
  })

  it('hydrateFromFull preserves dirty/error draft rows when shouldPreserveClientDraftOnHydration', () => {
    const store = readFileSync(
      join(process.cwd(), 'src/lib/stores/settlementFormStore.ts'),
      'utf8',
    )
    expect(store).toContain('shouldPreserveClientDraftOnHydration')
    expect(store).toContain('dirty')
    expect(store).toContain('saveStatus')
    expect(store).toContain('saveError')
  })

  it('SettlementForm gates failed new-settlement save — no clearStorage/router.replace on ok:false', () => {
    const form = readFileSync(
      join(process.cwd(), 'src/components/settlement/SettlementForm.tsx'),
      'utf8',
    )
    expect(form).toContain('shouldNavigateNewSettlementToEdit')
    const handleSaveBody = form.slice(form.indexOf('const handleSave = useCallback'))
    const failureReturnIdx = handleSaveBody.lastIndexOf('return { ok: false')
    const afterFailure = handleSaveBody.slice(failureReturnIdx)
    expect(afterFailure).not.toContain('clearStorage()')
    expect(afterFailure).not.toContain('router.replace')
  })

  it('footer uses save-integrity status label without idle saved fallback', () => {
    const footer = readFileSync(
      join(process.cwd(), 'src/components/settlement/SettlementFormFooter.tsx'),
      'utf8',
    )
    expect(footer).toContain('footerStatusLabel')
    expect(footer).not.toContain(": dirty ? '변경됨' : '저장됨'")
  })
})

describe('payload row count vs UI', () => {
  it('soft-deleted option rows are excluded from DB build but remain in payload array', () => {
    const rows = [
      { ...emptyOptionRow(), clientId: 'a', option_name: 'visible', unit_price_usd: 10, pax: 1 },
      {
        ...emptyOptionRow(),
        clientId: 'b',
        option_name: 'hidden deleted',
        unit_price_usd: 5,
        pax: 1,
        expense_usd: 100,
        deleted: true,
      },
    ]
    const payload = toDraftPayload(minimalState({ options: rows }))
    expect(payload.options).toHaveLength(2)
    const uiVisible = payload.options.filter((r) => !r.deleted)
    expect(uiVisible).toHaveLength(1)
    expect(buildOptionDbRows(rows, 'settlement-1', RATE)).toHaveLength(1)
  })

  it('negative COM rows still serialize for DB insert (constraint enforced server-side)', () => {
    const thirdNegative = {
      ...emptyOptionRow(),
      option_name: 'fail-option',
      unit_price_usd: 50,
      pax: 1,
      expense_usd: 200,
    }
    expect(calcOptionRowComUsd(thirdNegative, RATE)).toBeLessThan(0)
    expect(buildOptionDbRows([thirdNegative], 'settlement-1', RATE)[0]!.com_usd).toBeLessThan(0)
  })

  it('option_date null does not change derived com_usd', () => {
    const row = {
      ...emptyOptionRow(),
      option_name: 'dated-option',
      unit_price_usd: 30,
      pax: 2,
      expense_vnd: 500_000,
    }
    const withDate = { ...row, option_date: '2026-04-06' }
    const withoutDate = { ...row, option_date: null }
    expect(calcOptionRowComUsd(withoutDate, RATE)).toBe(calcOptionRowComUsd(withDate, RATE))
  })
})
