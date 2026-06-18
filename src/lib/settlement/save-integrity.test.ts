import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { applyDraftSaveResult } from './draft-save-flow'
import { emptyEntranceRow, emptyOptionRow } from './defaults'
import { emptyFormState, stateFromSettlementFull } from './mappers'
import {
  canProceedToSubmit,
  footerStatusLabel,
  hasActiveLocalDraft,
  mergePersistedSettlementDraft,
  SAVE_FAILED_SUBMIT_BLOCKED,
  shouldNavigateNewSettlementToEdit,
  shouldPreserveClientDraftOnHydration,
  shouldSkipNewFormBootstrapReset,
} from './save-integrity'
import type { SettlementFormState } from './form-types'
import type { SettlementFull } from '@/types'

const ROOT = process.cwd()

function minimalFull(id: string): SettlementFull {
  return {
    id,
    tour_id: 'tour-1',
    guide_id: 'guide-1',
    exchange_rate: 26000,
    status: 'draft',
    advance_vnd: 0,
    tour_fee_usd: 0,
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
    guide_submit_snapshot_id: null,
    hotels: [],
    meals: [],
    entrances: [],
    others: [],
    company_expenses: [],
    shoppings: [],
    options: [],
    receipts: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  } as unknown as SettlementFull
}

describe('save-integrity helpers', () => {
  it('shouldPreserveClientDraftOnHydration when dirty or error for same settlement id', () => {
    expect(
      shouldPreserveClientDraftOnHydration(
        { settlementId: 's1', dirty: true, saveStatus: 'idle' },
        's1',
      ),
    ).toBe(true)
    expect(
      shouldPreserveClientDraftOnHydration(
        { settlementId: 's1', dirty: false, saveStatus: 'error' },
        's1',
      ),
    ).toBe(true)
    expect(
      shouldPreserveClientDraftOnHydration(
        { settlementId: 's1', dirty: false, saveStatus: 'idle' },
        's1',
      ),
    ).toBe(false)
    expect(
      shouldPreserveClientDraftOnHydration(
        { settlementId: 's2', dirty: true, saveStatus: 'error' },
        's1',
      ),
    ).toBe(false)
  })

  it('footer shows 저장됨 only when saveStatus is saved', () => {
    expect(
      footerStatusLabel({
        pendingAction: null,
        saveStatus: 'idle',
        dirty: false,
        saveError: null,
        lastSavedAt: null,
      }),
    ).toBe('미저장')
    expect(
      footerStatusLabel({
        pendingAction: null,
        saveStatus: 'saved',
        dirty: false,
        saveError: null,
        lastSavedAt: '2026-01-01T12:00:00Z',
        formatSavedAt: () => '12:00',
      }),
    ).toContain('저장됨')
    expect(
      footerStatusLabel({
        pendingAction: null,
        saveStatus: 'error',
        dirty: true,
        saveError: '옵션 저장 실패',
        lastSavedAt: null,
      }),
    ).toBe('옵션 저장 실패')
  })

  it('canProceedToSubmit blocks after failed save', () => {
    expect(canProceedToSubmit({ saveStatus: 'error' })).toEqual({
      ok: false,
      error: SAVE_FAILED_SUBMIT_BLOCKED,
    })
    expect(canProceedToSubmit({ saveStatus: 'saved' })).toEqual({ ok: true })
  })

  it('shouldNavigateNewSettlementToEdit only on successful new save', () => {
    expect(shouldNavigateNewSettlementToEdit('new', true, true)).toBe(true)
    expect(shouldNavigateNewSettlementToEdit('new', true, false, true)).toBe(true)
    expect(shouldNavigateNewSettlementToEdit('new', false, true)).toBe(false)
    expect(shouldNavigateNewSettlementToEdit('new', true, false, false)).toBe(false)
    expect(shouldNavigateNewSettlementToEdit('edit', true, true)).toBe(false)
  })

  it('hasActiveLocalDraft detects dirty, error, saving, or line items', () => {
    expect(hasActiveLocalDraft({ dirty: true, options: [] })).toBe(true)
    expect(hasActiveLocalDraft({ saveStatus: 'error', options: [] })).toBe(true)
    expect(
      hasActiveLocalDraft({
        options: [{ deleted: false }],
      }),
    ).toBe(true)
    expect(hasActiveLocalDraft({ options: [{ deleted: true }] })).toBe(false)
  })

  it('shouldSkipNewFormBootstrapReset preserves same-tour failed draft', () => {
    expect(
      shouldSkipNewFormBootstrapReset(
        {
          guideName: 'g',
          tourId: 't1',
          settlementId: 's1',
          dirty: true,
          saveStatus: 'error',
          options: [{ deleted: false }],
        },
        't1',
        'g',
      ),
    ).toBe(true)
    expect(
      shouldSkipNewFormBootstrapReset(
        {
          guideName: 'g',
          tourId: 't1',
          settlementId: null,
          dirty: true,
          saveStatus: 'idle',
          options: [{ deleted: false }],
        },
        't1',
        'g',
      ),
    ).toBe(true)
    expect(
      shouldSkipNewFormBootstrapReset(
        {
          guideName: 'g',
          tourId: 't1',
          settlementId: 's1',
          dirty: false,
          saveStatus: 'idle',
          options: [],
        },
        't2',
        'g',
      ),
    ).toBe(false)
  })

  it('mergePersistedSettlementDraft keeps live dirty/error draft over stale persist', () => {
    const current = {
      ...stateFromSettlementFull(minimalFull('s1'), 'guide'),
      settlementId: 's1',
      dirty: true,
      saveStatus: 'error' as const,
      saveError: 'child failed',
      options: [{ ...emptyOptionRow(), clientId: 'o1', option_name: 'live' }],
    }
    const merged = mergePersistedSettlementDraft(
      {
        settlementId: null,
        options: [],
        dirty: false,
        saveStatus: 'idle',
        saveError: null,
      },
      current,
    )
    expect(merged.settlementId).toBe('s1')
    expect(merged.options).toHaveLength(1)
    expect(merged.saveStatus).toBe('error')
    expect(merged.saveError).toBe('child failed')
  })

  it('mergePersistedSettlementDraft rehydrates persisted failed draft on cold load', () => {
    const current = stateFromSettlementFull(minimalFull('s1'), 'guide')
    const merged = mergePersistedSettlementDraft(
      {
        settlementId: 's1',
        dirty: true,
        saveStatus: 'error',
        saveError: 'child failed',
        options: [{ ...emptyOptionRow(), clientId: 'o1', option_name: 'stored' }],
      },
      current,
    )
    expect(merged.settlementId).toBe('s1')
    expect(merged.options[0]?.option_name).toBe('stored')
    expect(merged.saveStatus).toBe('error')
  })

  it('mergePersistedSettlementDraft restores rows from sessionStorage on empty remount', () => {
    const current = emptyFormState('guide')
    const merged = mergePersistedSettlementDraft(
      {
        settlementId: 's1',
        tourId: 'tour-1',
        dirty: true,
        saveStatus: 'error',
        saveError: 'child failed',
        options: [
          { ...emptyOptionRow(), clientId: 'o1', option_name: 'stored-option', option_date: '2026-04-06' },
          { ...emptyOptionRow(), clientId: 'o2', option_name: 'stored-fail', deleted: false },
        ],
        entrances: [
          { ...emptyEntranceRow(), clientId: 'e1', attraction_name: 'stored-entrance', visit_date: '2026-04-07' },
        ],
      },
      current,
    )
    expect(merged.settlementId).toBe('s1')
    expect(merged.options).toHaveLength(2)
    expect(merged.entrances).toHaveLength(1)
    expect(merged.saveStatus).toBe('error')
    expect(merged.dirty).toBe(true)
  })
})

describe('applyDraftSaveResult failure integrity', () => {
  it('ok:false with id binds id but does not mark saved', () => {
    const markSaved = vi.fn()
    const setSaveError = vi.fn()
    const bindSettlementId = vi.fn()
    const result = applyDraftSaveResult(
      { ok: false, id: 'settlement-new', error: 'child persist failed' },
      {
        currentSettlementId: null,
        bindSettlementId,
        markSaved,
        mergeServerSync: vi.fn(),
        setSaveError,
      },
    )
    expect(result.ok).toBe(false)
    expect(result.settlementId).toBe('settlement-new')
    expect(bindSettlementId).toHaveBeenCalledWith('settlement-new')
    expect(markSaved).not.toHaveBeenCalled()
    expect(setSaveError).toHaveBeenCalledWith('child persist failed')
  })
})

describe('SettlementForm save failure path (static)', () => {
  it('does not clearStorage or router.replace when save fails on new settlement', () => {
    const form = readFileSync(
      join(ROOT, 'src/components/settlement/SettlementForm.tsx'),
      'utf8',
    )
    expect(form).toContain('shouldNavigateNewSettlementToEdit')
    const handleSaveBody = form.slice(form.indexOf('const handleSave = useCallback'))
    const failureReturnIdx = handleSaveBody.lastIndexOf('return { ok: false')
    const afterFailure = handleSaveBody.slice(failureReturnIdx)
    expect(afterFailure).not.toContain('clearStorage()')
    expect(afterFailure).not.toContain('router.replace')
  })

  it('handleSubmit gates on canProceedToSubmit before validation', () => {
    const form = readFileSync(
      join(ROOT, 'src/components/settlement/SettlementForm.tsx'),
      'utf8',
    )
    expect(form).toContain('canProceedToSubmit(useSettlementFormStore.getState())')
  })

  it('admin edit bootstrap delegates to settlement-form-edit-bootstrap helpers', () => {
    const form = readFileSync(
      join(ROOT, 'src/components/settlement/SettlementForm.tsx'),
      'utf8',
    )
    const bootstrap = readFileSync(
      join(ROOT, 'src/lib/settlement/settlement-form-edit-bootstrap.ts'),
      'utf8',
    )
    expect(form).toContain('resolveEditFormBootstrap')
    expect(form).toContain('applyEditFormBootstrapPlan')
    expect(form).toContain('applyAdminServerWinsState')
    expect(form).toContain('runPersistAwareBootstrap')
    expect(bootstrap).toContain('admin_server_wins')
    expect(bootstrap).toContain('applyAdminServerWinsState')
    expect(bootstrap).toContain('shouldPreserveClientDraftOnHydration')
    expect(bootstrap).toContain('sanitizeSettlementFullForGuide')
  })
})

describe('store hydrate preserves dirty failed client draft', () => {
  it('hydrateFromFull keeps client option/entrance rows when save failed', () => {
    const full = minimalFull('e502')
    const clientDraft: Partial<SettlementFormState> = {
      ...stateFromSettlementFull(full, 'guide'),
      settlementId: 'e502',
      dirty: true,
      saveStatus: 'error',
      saveError: 'child failed',
      options: [
        {
          ...emptyOptionRow(),
          clientId: 'o1',
          option_date: '2026-04-06',
          option_name: '아르마다 90분',
          unit_price_usd: 30,
          pax: 11,
          expense_vnd: 2_420_000,
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
    }

    const merged = { ...clientDraft }
    if (
      shouldPreserveClientDraftOnHydration(
        {
          settlementId: merged.settlementId ?? null,
          dirty: merged.dirty ?? false,
          saveStatus: merged.saveStatus ?? 'idle',
        },
        full.id,
      )
    ) {
      Object.assign(merged, {
        settlementStatus: full.status,
        guideSubmitSnapshotId: full.guide_submit_snapshot_id,
        receipts: full.receipts,
      })
    } else {
      Object.assign(merged, stateFromSettlementFull(full, 'guide'))
    }

    expect(merged.options).toHaveLength(1)
    expect(merged.options?.[0]?.option_date).toBe('2026-04-06')
    expect(merged.entrances?.[0]?.visit_date).toBe('2026-04-07')
    expect(merged.saveStatus).toBe('error')
    expect(merged.saveError).toBe('child failed')
  })
})

describe('deceptive save sequence simulation', () => {
  it('header-created child-failed keeps id, dirty, error, rows, dates; blocks submit', () => {
    type LocalState = {
      settlementId: string | null
      dirty: boolean
      saveStatus: SettlementFormState['saveStatus']
      saveError: string | null
      options: Array<{ option_date: string | null; option_name: string }>
      entrances: Array<{ visit_date: string | null }>
      storageCleared: boolean
      navigatedToEdit: boolean
    }

    const state: LocalState = {
      settlementId: null,
      dirty: true,
      saveStatus: 'idle',
      saveError: null,
      options: [
        {
          option_date: '2026-04-06',
          option_name: '아르마다 90분',
        },
      ],
      entrances: [{ visit_date: '2026-04-07' }],
      storageCleared: false,
      navigatedToEdit: false,
    }

    const markSaved = () => {
      state.dirty = false
      state.saveStatus = 'saved'
      state.saveError = null
    }
    const setSaveError = (msg: string) => {
      state.saveStatus = 'error'
      state.saveError = msg
      state.dirty = true
    }
    const bindSettlementId = (id: string) => {
      state.settlementId = id
      state.dirty = true
    }

    const saveResult = applyDraftSaveResult(
      { ok: false, id: 'header-created-id', error: 'option_items failed' },
      {
        currentSettlementId: state.settlementId,
        bindSettlementId,
        markSaved,
        mergeServerSync: () => {
          state.options = []
          state.entrances = []
        },
        setSaveError,
      },
    )

    if (
      shouldNavigateNewSettlementToEdit('new', saveResult.ok, saveResult.becameExistingSettlement)
    ) {
      state.storageCleared = true
      state.navigatedToEdit = true
    }

    expect(saveResult.ok).toBe(false)
    expect(state.settlementId).toBe('header-created-id')
    expect(state.dirty).toBe(true)
    expect(state.saveStatus).toBe('error')
    expect(state.options).toHaveLength(1)
    expect(state.options[0]?.option_date).toBe('2026-04-06')
    expect(state.entrances[0]?.visit_date).toBe('2026-04-07')
    expect(state.storageCleared).toBe(false)
    expect(state.navigatedToEdit).toBe(false)
    expect(canProceedToSubmit({ saveStatus: state.saveStatus }).ok).toBe(false)
    expect(footerStatusLabel({
      pendingAction: null,
      saveStatus: state.saveStatus,
      dirty: state.dirty,
      saveError: state.saveError,
      lastSavedAt: null,
    })).not.toContain('저장됨')
  })

  it('successful new save still navigates and would clear storage', () => {
    expect(shouldNavigateNewSettlementToEdit('new', true, true)).toBe(true)
    expect(shouldNavigateNewSettlementToEdit('new', false, true)).toBe(false)
  })
})

describe('settlementFormStore setSaveError', () => {
  it('sets dirty:true on save failure', () => {
    const store = readFileSync(
      join(ROOT, 'src/lib/stores/settlementFormStore.ts'),
      'utf8',
    )
    expect(store).toMatch(/setSaveError:[\s\S]*dirty: true/)
  })
})
