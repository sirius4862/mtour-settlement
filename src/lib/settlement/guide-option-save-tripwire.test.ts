import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { emptyOptionRow } from './defaults'
import { sanitizeGuideDraftPayload, toDraftPayload } from './mappers'
import * as lineItemPersistPrep from './line-item-persist-prep'
import {
  buildGuideOptionDeleteIds,
  collectKnownLineItemIds,
  stripOrphanLineItemIdsFromPayload,
} from './line-item-persist-prep'
import {
  guideOptionCountDecreaseReason,
  hasExplicitGuideOptionDeleteIntent,
  P0_OPTION_TRIPWIRE_DELETE_IDS_SAMPLE_MAX,
  P0_OPTION_TRIPWIRE_DELETE_IDS_TAG,
  P0_OPTION_TRIPWIRE_ERROR_TAG,
  P0_OPTION_TRIPWIRE_OPTION_COUNT_DECREASE_TAG,
  runGuideOptionSaveTripwirePostPersist,
  runGuideOptionSaveTripwirePrePersist,
  sampleDeleteIdsForTripwireLog,
  shouldWarnGuideOptionCountDecrease,
  warnGuideOptionCountDecrease,
  warnGuideOptionDeleteIdsPlanned,
} from './guide-option-save-tripwire'
import * as safeErrors from '@/lib/server/safe-errors'
import type { SettlementFull, Tour } from '@/types'
import type { SettlementFormState } from './form-types'

const ACTIONS_PATH = join(process.cwd(), 'src/lib/actions/settlementActions.ts')
const SETTLEMENT_ID = '11111111-1111-1111-1111-111111111111'
const TOUR_ID = '22222222-2222-2222-2222-222222222222'

function mockTour(): Tour {
  return {
    id: TOUR_ID,
    tour_code: 'APR26-01',
    pattern: '다낭',
    agency_name: 'QA',
    start_date: '2026-04-01',
    end_date: '2026-04-04',
    pax_count: 10,
    nights: 3,
    vehicle_type: '29인승',
    guide_id: 'guide-1',
    tc_name: null,
    branch_id: 'branch-1',
    assignment_status: 'assigned',
    recalled_at: null,
    recalled_by: null,
    created_by: 'admin-1',
    created_at: '',
    updated_at: '',
  }
}

function guideOptionRow(overrides: Partial<ReturnType<typeof emptyOptionRow>> = {}) {
  return {
    ...emptyOptionRow(false),
    option_name: '보트투어',
    unit_price_usd: 25,
    pax: 8,
    expense_usd: 10,
    expense_vnd: 0,
    ...overrides,
  }
}

function draftStateWithOptions(settlementId: string | null = SETTLEMENT_ID): SettlementFormState {
  return {
    settlementId,
    tourId: TOUR_ID,
    tour: mockTour(),
    guideName: '가이드',
    exchange_rate: 26000,
    header: {
      advance_vnd: 0,
      charming_other_usd: 0,
      tip_received_usd: 0,
      option_receivable_usd: 0,
      tip_transfer_usd: 0,
      ground_fee_usd: 0,
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
    meals: [],
    entrances: [],
    others: [],
    companyExpenses: [],
    shoppings: [],
    options: [guideOptionRow()],
    receipts: [],
    settlementStatus: 'draft',
    guideSubmitSnapshotId: null,
    dirty: true,
    saveStatus: 'idle',
    lastSavedAt: null,
    saveError: null,
  }
}

function existingSettlementWithOptions(optionId = 'opt-db-1'): SettlementFull {
  return {
    id: SETTLEMENT_ID,
    tour_id: TOUR_ID,
    guide_id: 'guide-1',
    branch_id: 'branch-1',
    status: 'draft',
    year_month: '2026-04',
    exchange_rate: 26000,
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
    admin_note: null,
    reject_reason: null,
    submitted_at: null,
    reviewed_at: null,
    paid_at: null,
    edit_requested_at: null,
    reviewed_by: null,
    edit_requested_by: null,
    sent_for_confirmation_at: null,
    sent_for_confirmation_by: null,
    guide_confirmed_at: null,
    guide_confirmed_by: null,
    clarification_requested_at: null,
    clarification_message: null,
    active_confirmation_id: null,
    guide_submit_snapshot_id: null,
    calc_summary_json: null,
    created_at: '',
    updated_at: '',
    tour: mockTour(),
    hotels: [],
    meals: [],
    entrances: [],
    others: [],
    shoppings: [],
    options: [
      {
        id: optionId,
        settlement_id: SETTLEMENT_ID,
        option_date: '2026-04-02',
        option_name: '보트투어',
        unit_price_usd: 25,
        pax: 8,
        total_sale_usd: 200,
        expense_usd: 10,
        expense_vnd: 0,
        com_usd: 190,
        is_extra_vehicle: false,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      },
    ],
    company_expenses: [],
    receipts: [],
  }
}

describe('guide option save tripwire — pure helpers', () => {
  it('sampleDeleteIdsForTripwireLog caps at 5 ids', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `id-${i}`)
    expect(sampleDeleteIdsForTripwireLog(ids)).toHaveLength(P0_OPTION_TRIPWIRE_DELETE_IDS_SAMPLE_MAX)
    expect(sampleDeleteIdsForTripwireLog(ids)).toEqual(['id-0', 'id-1', 'id-2', 'id-3', 'id-4'])
  })

  it('shouldWarnGuideOptionCountDecrease covers partial and to-zero without explicit intent', () => {
    expect(
      shouldWarnGuideOptionCountDecrease({
        priorGuideOptionCount: 3,
        postGuideOptionCount: 0,
        status: 'draft',
        explicitDeleteIntent: false,
      }),
    ).toBe(true)
    expect(
      shouldWarnGuideOptionCountDecrease({
        priorGuideOptionCount: 3,
        postGuideOptionCount: 2,
        status: 'draft',
        explicitDeleteIntent: false,
      }),
    ).toBe(true)
    expect(
      shouldWarnGuideOptionCountDecrease({
        priorGuideOptionCount: 3,
        postGuideOptionCount: 2,
        status: 'draft',
        explicitDeleteIntent: true,
      }),
    ).toBe(false)
  })

  it('guideOptionCountDecreaseReason distinguishes partial vs to_zero', () => {
    expect(guideOptionCountDecreaseReason(3, 0)).toBe('to_zero')
    expect(guideOptionCountDecreaseReason(3, 2)).toBe('partial')
    expect(guideOptionCountDecreaseReason(2, 2)).toBeNull()
  })
})

describe('guide option save tripwire — explicitDeleteIntent', () => {
  it('legitimate explicit delete-all → explicitDeleteIntent true', () => {
    const existing = existingSettlementWithOptions()
    const sanitized = sanitizeGuideDraftPayload(
      {
        ...toDraftPayload(draftStateWithOptions(SETTLEMENT_ID)),
        options: [{ ...guideOptionRow(), id: 'opt-db-1', deleted: true }],
      },
      existing,
    )
    expect(hasExplicitGuideOptionDeleteIntent(sanitized.options)).toBe(true)
    expect(buildGuideOptionDeleteIds(sanitized.options, existing.options)).toEqual(['opt-db-1'])
  })

  it('omitted options / options:[] → explicitDeleteIntent false', () => {
    const existing = existingSettlementWithOptions()
    const omitted = sanitizeGuideDraftPayload(
      { ...toDraftPayload(draftStateWithOptions(SETTLEMENT_ID)), options: undefined as unknown as [] },
      existing,
    )
    const empty = sanitizeGuideDraftPayload(
      { ...toDraftPayload(draftStateWithOptions(SETTLEMENT_ID)), options: [] },
      existing,
    )
    expect(hasExplicitGuideOptionDeleteIntent(omitted.options)).toBe(false)
    expect(hasExplicitGuideOptionDeleteIntent(empty.options)).toBe(false)
    expect(buildGuideOptionDeleteIds(empty.options, existing.options)).toEqual([])
  })

  it('stale stripped retry → explicitDeleteIntent false and no delete ids', () => {
    const existing = existingSettlementWithOptions()
    const payload = sanitizeGuideDraftPayload(
      stripOrphanLineItemIdsFromPayload(
        {
          ...toDraftPayload(draftStateWithOptions(SETTLEMENT_ID)),
          options: [
            {
              ...guideOptionRow(),
              id: 'stale-not-in-db',
              clientId: 'stale-client',
            },
          ],
        },
        collectKnownLineItemIds(existing),
      ),
      existing,
    )
    expect(hasExplicitGuideOptionDeleteIntent(payload.options)).toBe(false)
    expect(buildGuideOptionDeleteIds(payload.options, existing.options)).toEqual([])
  })

  it('granular delete of one row → explicitDeleteIntent true', () => {
    expect(
      hasExplicitGuideOptionDeleteIntent([
        { id: 'opt-1', deleted: true, is_extra_vehicle: false },
        { id: 'opt-2', deleted: false, is_extra_vehicle: false },
      ]),
    ).toBe(true)
  })

  it('normal preserve save → no delete warning from tripwire pre-persist', () => {
    const existing = existingSettlementWithOptions()
    const sanitized = sanitizeGuideDraftPayload(
      toDraftPayload(draftStateWithOptions(SETTLEMENT_ID)),
      existing,
    )
    const warnSpy = vi.spyOn(safeErrors, 'logServerWarning').mockImplementation(() => {})

    runGuideOptionSaveTripwirePrePersist({
      settlementId: SETTLEMENT_ID,
      payloadOptions: sanitized.options,
      existingOptions: existing.options,
      saveMode: 'draft_save_only',
      isEditPath: true,
    })

    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('guide option save tripwire — warning emission', () => {
  beforeEach(() => {
    vi.spyOn(safeErrors, 'logServerWarning').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits capped delete-plan warning with stable tag', () => {
    const deleteIds = Array.from({ length: 7 }, (_, i) => `opt-${i}`)
    warnGuideOptionDeleteIdsPlanned({
      settlementId: 'set-1',
      deleteIds,
      priorGuideOptionCount: 7,
      incomingGuideOptionCount: 0,
      saveMode: 'draft_save_only',
      explicitDeleteIntent: false,
    })

    expect(safeErrors.logServerWarning).toHaveBeenCalledWith(
      `${P0_OPTION_TRIPWIRE_DELETE_IDS_TAG} guide option delete ids planned`,
      expect.objectContaining({
        settlementId: 'set-1',
        deleteIdsCount: 7,
        deleteIdsSample: deleteIds.slice(0, 5),
      }),
    )
    const payload = vi.mocked(safeErrors.logServerWarning).mock.calls[0]?.[1] as Record<
      string,
      unknown
    >
    expect(payload).not.toHaveProperty('deleteIds')
  })

  it('emits count decrease warning for to_zero and partial', () => {
    warnGuideOptionCountDecrease({
      settlementId: 'set-1',
      priorGuideOptionCount: 3,
      postGuideOptionCount: 0,
      status: 'draft',
      saveMode: 'draft_save_only',
      explicitDeleteIntent: false,
    })
    expect(safeErrors.logServerWarning).toHaveBeenCalledWith(
      `${P0_OPTION_TRIPWIRE_OPTION_COUNT_DECREASE_TAG} guide option_items decreased without explicit delete intent`,
      expect.objectContaining({ decreaseReason: 'to_zero' }),
    )

    vi.mocked(safeErrors.logServerWarning).mockClear()
    warnGuideOptionCountDecrease({
      settlementId: 'set-1',
      priorGuideOptionCount: 3,
      postGuideOptionCount: 2,
      status: 'draft',
      saveMode: 'draft_save_only',
      explicitDeleteIntent: false,
    })
    expect(safeErrors.logServerWarning).toHaveBeenCalledWith(
      `${P0_OPTION_TRIPWIRE_OPTION_COUNT_DECREASE_TAG} guide option_items decreased without explicit delete intent`,
      expect.objectContaining({ decreaseReason: 'partial' }),
    )
  })

  it('does not emit count decrease warning when explicit delete intent is true', () => {
    warnGuideOptionCountDecrease({
      settlementId: 'set-1',
      priorGuideOptionCount: 3,
      postGuideOptionCount: 0,
      status: 'draft',
      saveMode: 'draft_save_only',
      explicitDeleteIntent: true,
    })
    expect(safeErrors.logServerWarning).not.toHaveBeenCalled()
  })
})

describe('guide option save tripwire — error isolation', () => {
  beforeEach(() => {
    vi.spyOn(safeErrors, 'logServerWarning').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pre-persist runner swallows internal throws and logs tripwire error', () => {
    vi.spyOn(lineItemPersistPrep, 'buildGuideOptionDeleteIds').mockImplementation(() => {
      throw new Error('delete ids failed')
    })

    expect(() =>
      runGuideOptionSaveTripwirePrePersist({
        settlementId: 'set-1',
        payloadOptions: [],
        existingOptions: [{ id: 'opt-1', is_extra_vehicle: false }],
        saveMode: 'draft_save_only',
        isEditPath: true,
      }),
    ).not.toThrow()

    expect(safeErrors.logServerWarning).toHaveBeenCalledWith(
      `${P0_OPTION_TRIPWIRE_ERROR_TAG} tripwire failed`,
      expect.objectContaining({
        settlementId: 'set-1',
        phase: 'pre_persist',
        message: 'delete ids failed',
      }),
    )
  })

  it('post-persist runner swallows read-back throws and logs tripwire error', () => {
    expect(() =>
      runGuideOptionSaveTripwirePostPersist({
        settlementId: 'set-1',
        priorGuideOptionCount: 2,
        postOptions: {
          filter: () => {
            throw new Error('read-back failed')
          },
        } as never,
        payloadOptions: [],
        status: 'draft',
        saveMode: 'draft_save_only',
        explicitDeleteIntent: false,
        isEditPath: true,
      }),
    ).not.toThrow()

    expect(safeErrors.logServerWarning).toHaveBeenCalledWith(
      `${P0_OPTION_TRIPWIRE_ERROR_TAG} tripwire failed`,
      expect.objectContaining({
        phase: 'post_persist',
        message: 'read-back failed',
      }),
    )
  })

  it('tripwire failure does not change save result shape (source-level)', () => {
    const saveBody = readFileSync(ACTIONS_PATH, 'utf8')
    const fnStart = saveBody.indexOf('export async function saveSettlementDraft')
    const fnEnd = saveBody.indexOf('export async function saveAdminSettlementEdits', fnStart)
    const body = saveBody.slice(fnStart, fnEnd)
    expect(body).toContain('runGuideOptionSaveTripwirePrePersist(')
    expect(body).not.toContain('if (!tripwirePre)')
    expect(body).toContain('return finalizeWithActionWall({ ok: true')
  })
})

describe('saveSettlementDraft — option tripwire wiring (source-level)', () => {
  const body = readFileSync(ACTIONS_PATH, 'utf8')
  const fnStart = body.indexOf('export async function saveSettlementDraft')
  const fnEnd = body.indexOf('export async function saveAdminSettlementEdits', fnStart)
  const saveBody = body.slice(fnStart, fnEnd)

  it('runs isolated tripwire before and after persist on edit path', () => {
    expect(saveBody).toContain('runGuideOptionSaveTripwirePrePersist(')
    expect(saveBody).toContain('runGuideOptionSaveTripwirePostPersist(')
    expect(saveBody.indexOf('runGuideOptionSaveTripwirePrePersist')).toBeLessThan(
      saveBody.indexOf('persistSettlementLineItems('),
    )
    expect(saveBody.indexOf('runGuideOptionSaveTripwirePostPersist')).toBeGreaterThan(
      saveBody.indexOf('persistSettlementLineItems('),
    )
  })

  it('uses sanitize/strip path before tripwire on incident payloads', () => {
    expect(saveBody).toContain('stripOrphanLineItemIdsFromPayload(payload, knownLineItemIds)')
    expect(saveBody).toContain('sanitizeGuideDraftPayload(payloadToSave, existingForItemPersist)')
    expect(saveBody.indexOf('sanitizeGuideDraftPayload(payloadToSave')).toBeLessThan(
      saveBody.indexOf('runGuideOptionSaveTripwirePrePersist'),
    )
  })
})

describe('logServerWarning visibility', () => {
  it('uses console.warn for Vercel serverless log capture', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    safeErrors.logServerWarning('[P0_OPTION_TRIPWIRE_DELETE_IDS] test', { settlementId: 'x' })
    expect(warnSpy).toHaveBeenCalledWith('[P0_OPTION_TRIPWIRE_DELETE_IDS] test', {
      settlementId: 'x',
    })
    warnSpy.mockRestore()
  })
})
