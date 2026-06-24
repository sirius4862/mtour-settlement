import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SettlementFull, Tour } from '@/types'
import {
  aggregateLineItemPersistTimings,
  canSkipPostSaveReloadForNoopSave,
  guideHeaderUpsertDiffersFromExisting,
  isGuideEditableSettlementStatus,
  predictLineItemPersistAggregate,
  type GuideDraftSaveContext,
} from './noop-draft-save-fast-path'
import {
  sanitizeGuideDraftPayload,
  stateFromSettlementFull,
  toDraftPayload,
  type SettlementDraftPayload,
} from './mappers'
import type { SettlementFormState } from './form-types'
import type { SettlementSaveTiming } from './save-step-diagnostics'
import {
  collectKnownLineItemIds,
  stripOrphanLineItemIdsFromPayload,
} from './line-item-persist-prep'

const ROOT = join(process.cwd())
const SETTLEMENT_ID = '11111111-1111-1111-1111-111111111111'
const TOUR_ID = '22222222-2222-2222-2222-222222222222'

function readRepoFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const noopPersist = {
  totalRequests: 0,
  plannedDeletes: 0,
  plannedInserts: 0,
  candidateUpdates: 37,
  updatesSkipped: 37,
}

function skipInput(
  overrides: Partial<Parameters<typeof canSkipPostSaveReloadForNoopSave>[0]> = {},
) {
  return {
    saveContext: 'draft_save_only' as const,
    isEditPath: true,
    isEditableStatus: true,
    hasPreloadedState: true,
    persist: noopPersist,
    headerChanged: false,
    receiptsChanged: false,
    ...overrides,
  }
}

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

function existingSettlement(): SettlementFull {
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
    meals: [
      {
        id: 'meal-1',
        settlement_id: SETTLEMENT_ID,
        meal_date: null,
        restaurant_name: '식당',
        pax: 10,
        unit_price_vnd: 100000,
        amount_vnd: 1000000,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      },
    ],
    entrances: [],
    others: [],
    shoppings: [],
    options: [
      {
        id: 'opt-1',
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

function draftStateFromExisting(): SettlementFormState {
  return stateFromSettlementFull(existingSettlement(), '가이드')
}

/** Mirrors saveSettlementDraft post-persist skip decision inputs. */
function evaluatePostSaveReloadSkip(
  saveContext: GuideDraftSaveContext,
  payload: SettlementDraftPayload,
  existing: SettlementFull,
  persistTimings?: SettlementSaveTiming[],
) {
  const coreRow = existing as unknown as Record<string, unknown>
  const headerUpsert = {
    exchange_rate: payload.exchange_rate,
    advance_vnd: payload.header.advance_vnd,
    tour_fee_usd: existing.tour_fee_usd,
    ground_fee_usd: payload.header.ground_fee_usd ?? 0,
    charming_other_usd: payload.header.charming_other_usd,
    tip_received_usd: payload.header.tip_received_usd,
    option_receivable_usd: payload.header.option_receivable_usd,
    tip_transfer_usd: payload.header.tip_transfer_usd,
    option_credit_usd: payload.header.option_credit_usd,
    vehicle_fee_usd: payload.header.vehicle_fee_usd,
    head_tax_usd: payload.header.head_tax_usd,
    seoul_biz_fee_usd: payload.header.seoul_biz_fee_usd,
    tc_guide_usd: payload.header.tc_guide_usd,
    tc_company_usd: payload.header.tc_company_usd,
    megugi_usd: payload.header.megugi_usd,
    guide_daily_fee_usd: payload.header.guide_daily_fee_usd,
    settlement_ratio: payload.header.settlement_ratio,
    guide_note: payload.header.guide_note,
  }
  const predicted = predictLineItemPersistAggregate(existing.id, payload, existing)
  const measured = persistTimings
    ? aggregateLineItemPersistTimings(persistTimings)
    : predicted

  return canSkipPostSaveReloadForNoopSave({
    saveContext,
    isEditPath: !!payload.settlementId,
    isEditableStatus: isGuideEditableSettlementStatus(existing.status),
    hasPreloadedState: true,
    headerChanged: guideHeaderUpsertDiffersFromExisting(headerUpsert, coreRow),
    receiptsChanged: false,
    persist: measured,
  })
}

function unchangedEditPayload(): SettlementDraftPayload {
  const existing = existingSettlement()
  const hydrated = draftStateFromExisting()
  return stripOrphanLineItemIdsFromPayload(
    sanitizeGuideDraftPayload(toDraftPayload(hydrated), existing),
    collectKnownLineItemIds(existing),
  )
}

describe('save path selection (mirrors saveSettlementDraft)', () => {
  it('no-change standalone draft save uses post-save reload fast path', () => {
    const existing = existingSettlement()
    const payload = unchangedEditPayload()

    expect(evaluatePostSaveReloadSkip('draft_save_only', payload, existing)).toBe(true)
  })

  it('changed header edit save uses normal post-save reload path', () => {
    const existing = existingSettlement()
    const payload = unchangedEditPayload()
    payload.header = { ...payload.header, guide_note: 'updated note' }

    expect(evaluatePostSaveReloadSkip('draft_save_only', payload, existing)).toBe(false)
  })

  it('changed child-row edit save uses normal post-save reload path', () => {
    const existing = existingSettlement()
    const hydrated = draftStateFromExisting()
    hydrated.options[0] = { ...hydrated.options[0]!, option_name: '변경된 옵션' }
    const payload = stripOrphanLineItemIdsFromPayload(
      sanitizeGuideDraftPayload(toDraftPayload(hydrated), existing),
      collectKnownLineItemIds(existing),
    )

    expect(evaluatePostSaveReloadSkip('draft_save_only', payload, existing)).toBe(false)
    expect(predictLineItemPersistAggregate(existing.id, payload, existing).totalRequests).toBe(1)
  })

  it('save-before-submit does not use post-save reload fast path even when unchanged', () => {
    const existing = existingSettlement()
    const payload = unchangedEditPayload()

    expect(evaluatePostSaveReloadSkip('save_before_submit', payload, existing)).toBe(false)
  })

  it('measured persist timings with zero requests still allow fast path for draft_save_only', () => {
    const existing = existingSettlement()
    const payload = unchangedEditPayload()
    const timings: SettlementSaveTiming[] = [
      {
        step: 'persist_line_items_table',
        ms: 10,
        table: 'option_items',
        requestCount: 0,
        deleteIds: 0,
        inserts: 0,
        updates: 1,
        updatesSkipped: 1,
      },
    ]

    expect(evaluatePostSaveReloadSkip('draft_save_only', payload, existing, timings)).toBe(
      true,
    )
  })
})

describe('canSkipPostSaveReloadForNoopSave', () => {
  it('allows skip for no-change 임시저장 (draft_save_only) edit save', () => {
    expect(canSkipPostSaveReloadForNoopSave(skipInput())).toBe(true)
  })

  it('rejects save-before-submit even when payload is otherwise unchanged', () => {
    expect(
      canSkipPostSaveReloadForNoopSave(
        skipInput({ saveContext: 'save_before_submit' }),
      ),
    ).toBe(false)
  })

  it('rejects new settlement create path', () => {
    expect(canSkipPostSaveReloadForNoopSave(skipInput({ isEditPath: false }))).toBe(false)
  })

  it('rejects non-editable settlement status', () => {
    expect(canSkipPostSaveReloadForNoopSave(skipInput({ isEditableStatus: false }))).toBe(
      false,
    )
  })

  it('rejects when header changed', () => {
    expect(canSkipPostSaveReloadForNoopSave(skipInput({ headerChanged: true }))).toBe(false)
  })

  it('rejects when line item update requests were sent', () => {
    expect(
      canSkipPostSaveReloadForNoopSave(
        skipInput({ persist: { ...noopPersist, totalRequests: 1 } }),
      ),
    ).toBe(false)
  })

  it('rejects when planned deletes exist', () => {
    expect(
      canSkipPostSaveReloadForNoopSave(
        skipInput({ persist: { ...noopPersist, plannedDeletes: 1 } }),
      ),
    ).toBe(false)
  })

  it('rejects when planned inserts exist', () => {
    expect(
      canSkipPostSaveReloadForNoopSave(
        skipInput({ persist: { ...noopPersist, plannedInserts: 1 } }),
      ),
    ).toBe(false)
  })

  it('rejects when receipts changed flag is set', () => {
    expect(canSkipPostSaveReloadForNoopSave(skipInput({ receiptsChanged: true }))).toBe(false)
  })
})

describe('predictLineItemPersistAggregate — option_items no-change requestCount', () => {
  it('predicts zero requests for unchanged hydrated draft', () => {
    const existing = existingSettlement()
    const hydrated = draftStateFromExisting()
    const payload = stripOrphanLineItemIdsFromPayload(
      sanitizeGuideDraftPayload(toDraftPayload(hydrated), existing),
      collectKnownLineItemIds(existing),
    )

    expect(predictLineItemPersistAggregate(SETTLEMENT_ID, payload, existing)).toEqual({
      totalRequests: 0,
      plannedDeletes: 0,
      plannedInserts: 0,
      candidateUpdates: 2,
      updatesSkipped: 2,
    })
  })

  it('predicts update request when option_name changes', () => {
    const existing = existingSettlement()
    const hydrated = draftStateFromExisting()
    hydrated.options[0] = { ...hydrated.options[0]!, option_name: '변경' }
    const payload = stripOrphanLineItemIdsFromPayload(
      sanitizeGuideDraftPayload(toDraftPayload(hydrated), existing),
      collectKnownLineItemIds(existing),
    )

    expect(
      predictLineItemPersistAggregate(SETTLEMENT_ID, payload, existing).totalRequests,
    ).toBe(1)
  })

  it('predicts insert request for new child row', () => {
    const existing = existingSettlement()
    const hydrated = draftStateFromExisting()
    hydrated.meals.push({
      clientId: 'meal-new',
      meal_date: null,
      restaurant_name: '신규',
      pax: 5,
      unit_price_vnd: 50000,
    })
    const payload: SettlementDraftPayload = toDraftPayload(hydrated)

    expect(
      predictLineItemPersistAggregate(SETTLEMENT_ID, payload, existing).plannedInserts,
    ).toBeGreaterThan(0)
  })

  it('does not plan deletes for bare empty section (save blocked by hydration guard)', () => {
    const existing = existingSettlement()
    const hydrated = draftStateFromExisting()
    hydrated.meals = []
    const payload = stripOrphanLineItemIdsFromPayload(
      sanitizeGuideDraftPayload(toDraftPayload(hydrated), existing),
      collectKnownLineItemIds(existing),
    )

    expect(
      predictLineItemPersistAggregate(SETTLEMENT_ID, payload, existing).plannedDeletes,
    ).toBe(0)
  })

  it('predicts delete request for intentional soft-delete-all', () => {
    const existing = existingSettlement()
    const hydrated = draftStateFromExisting()
    hydrated.meals = hydrated.meals.map((row) => ({
      ...row,
      deleted: true,
    }))
    const payload = toDraftPayload(hydrated)

    expect(
      predictLineItemPersistAggregate(SETTLEMENT_ID, payload, existing).plannedDeletes,
    ).toBe(1)
  })
})

describe('isGuideEditableSettlementStatus', () => {
  it('accepts draft and edit-requested statuses', () => {
    expect(isGuideEditableSettlementStatus('draft')).toBe(true)
    expect(isGuideEditableSettlementStatus('edit_requested')).toBe(true)
    expect(isGuideEditableSettlementStatus('submitted')).toBe(false)
  })
})

describe('aggregateLineItemPersistTimings', () => {
  it('sums option_items updatesSkipped from measured persist timings', () => {
    const timings: SettlementSaveTiming[] = [
      {
        step: 'persist_line_items_table',
        ms: 0,
        table: 'option_items',
        requestCount: 0,
        deleteIds: 0,
        inserts: 0,
        updates: 3,
        updatesSkipped: 3,
      },
    ]
    expect(aggregateLineItemPersistTimings(timings)).toMatchObject({
      totalRequests: 0,
      updatesSkipped: 3,
    })
  })
})

describe('guideHeaderUpsertDiffersFromExisting', () => {
  const existing = {
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
  }

  it('returns false when header fields match', () => {
    expect(guideHeaderUpsertDiffersFromExisting(existing, existing)).toBe(false)
  })

  it('returns true when guide_note changes', () => {
    expect(
      guideHeaderUpsertDiffersFromExisting({ ...existing, guide_note: 'x' }, existing),
    ).toBe(true)
  })
})

describe('saveSettlementDraft post-save reload skip wiring', () => {
  function saveDraftBody(): string {
    const source = readRepoFile('src/lib/actions/settlementActions.ts')
    return source.slice(
      source.indexOf('export async function saveSettlementDraft'),
      source.indexOf('export async function saveAdminSettlementEdits'),
    )
  }

  it('uses canSkipPostSaveReloadForNoopSave with explicit saveContext', () => {
    const body = saveDraftBody()
    expect(body).toContain('canSkipPostSaveReloadForNoopSave(')
    expect(body).toContain('saveContext')
    expect(body).toContain('skipPostSaveReload')
    expect(body).toContain('full = existingForItemPersist')
    expect(body).not.toContain('useNoopFastPath')
    expect(body).not.toContain('noop fast path')
  })

  it('always runs header upsert on edit path (no header upsert skip)', () => {
    const body = saveDraftBody()
    expect(body).toContain('Promise.all([')
    expect(body).toContain('upsertSettlement(headerUpsertInput)')
    expect(body).not.toContain('if (useNoopFastPath)')
  })

  it('passes save_before_submit purpose from submitSettlement', () => {
    expect(readRepoFile('src/lib/actions/settlementActions.ts')).toContain(
      "{ purpose: 'save_before_submit' }",
    )
  })

  it('SettlementForm passes draft_save_only vs save_before_submit purpose', () => {
    expect(readRepoFile('src/components/settlement/SettlementForm.tsx')).toContain(
      "purpose: action === 'save_then_submit' ? 'save_before_submit' : 'draft_save_only'",
    )
  })

  it('saveAdminSettlementEdits does not use post-save reload skip helper', () => {
    const adminBody = readRepoFile('src/lib/actions/settlementActions.ts').slice(
      readRepoFile('src/lib/actions/settlementActions.ts').indexOf(
        'export async function saveAdminSettlementEdits',
      ),
    )
    expect(adminBody).not.toContain('canSkipPostSaveReloadForNoopSave')
  })

  it('duplicate settlement guard remains intact', () => {
    expect(readRepoFile('src/lib/actions/settlementActions.ts')).toContain(
      'SETTLEMENT_DUPLICATE_TOUR_ERROR',
    )
  })

  it('negative company deposit and option persist suites remain', () => {
    expect(readRepoFile('src/lib/settlement/negative-company-deposit-policy.test.ts')).toContain(
      'negative company deposit policy',
    )
    expect(readRepoFile('src/lib/settlement/option-item-persist.test.ts')).toContain(
      'unchanged update skipping',
    )
  })
})
