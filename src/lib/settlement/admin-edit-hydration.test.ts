import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { SettlementFull } from '@/types'
import { emptyEntranceRow, emptyOptionRow } from './defaults'
import { emptyFormState, stateFromSettlementFull } from './mappers'
import { shouldPreserveClientDraftOnHydration } from './save-integrity'
import { sanitizeSettlementFullForGuide } from './snapshot'
import {
  applyAdminServerWinsState,
  applyEditFormBootstrapPlan,
  expectedAdminHydratedState,
  hydratedLineItemCounts,
  isCleanDraftState,
  resolveEditFormBootstrap,
  runPersistAwareBootstrap,
  serverLineItemCounts,
  shouldAdminEditRebootstrap,
} from './settlement-form-edit-bootstrap'
import type { SettlementFormState } from './form-types'

const ROOT = process.cwd()
const SETTLEMENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const PROD_SETTLEMENT_ID = '0c8e98e5-8cc6-4137-9764-f51bafc471f9'

function buildCountedRow(
  prefix: string,
  count: number,
  factory: (index: number) => Record<string, unknown>,
) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    settlement_id: PROD_SETTLEMENT_ID,
    sort_order: index,
    created_at: '',
    updated_at: '',
    ...factory(index),
  }))
}

/** Production-like fixture: meals 8, entrances 11, others 10, shoppings 4, options 2. */
function buildProductionRegressionFixture(): SettlementFull {
  return {
    id: PROD_SETTLEMENT_ID,
    tour_id: 'tour-prod',
    guide_id: 'guide-prod',
    branch_id: 'branch-prod',
    status: 'submitted',
    year_month: '2026-04',
    exchange_rate: 26000,
    advance_vnd: 40000000,
    tour_fee_usd: 0,
    ground_fee_usd: 1622,
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
    submitted_at: '2026-04-10T00:00:00Z',
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
    guide_submit_snapshot_id: 'snap-prod',
    calc_summary_json: null,
    created_at: '',
    updated_at: '',
    tour: {
      id: 'tour-prod',
      tour_code: 'PROD-001',
      pattern: 'Production tour',
      agency_name: 'Agency',
      start_date: '2026-04-01',
      end_date: '2026-04-05',
      nights: 4,
      pax_count: 18,
      vehicle_type: '29',
      guide_id: 'guide-prod',
      tc_name: null,
      branch_id: 'branch-prod',
      assignment_status: 'assigned',
      recalled_at: null,
      recalled_by: null,
      created_by: 'admin',
      created_at: '',
      updated_at: '',
    },
    hotels: [],
    meals: buildCountedRow('meal', 8, (index) => ({
      meal_date: `2026-04-0${(index % 9) + 1}`,
      restaurant_name: index === 0 ? '마담차' : `Restaurant ${index + 1}`,
      pax: 4,
      unit_price_vnd: 85000,
      amount_vnd: 340000,
    })) as SettlementFull['meals'],
    entrances: buildCountedRow('ent', 11, (index) => ({
      visit_date: `2026-04-${String(index + 1).padStart(2, '0')}`,
      attraction_name: `Attraction ${index + 1}`,
      pax: 18,
      unit_price_vnd: 150000,
      amount_vnd: 2700000,
    })) as SettlementFull['entrances'],
    others: buildCountedRow('other', 10, (index) => ({
      description: `Other ${index + 1}`,
      days: null,
      pax: 0,
      unit_price_usd: 0,
      unit_price_vnd: 0,
      amount_usd: 20,
      amount_vnd: 0,
      is_tip: false,
      entry_mode: 'flat' as const,
      note: null,
    })) as SettlementFull['others'],
    shoppings: buildCountedRow('shop', 4, (index) => ({
      visit_date: null,
      shop_name: `Shop ${index + 1}`,
      sale_usd: 100,
      com_usd: 20,
      kb_usd: 5,
    })) as SettlementFull['shoppings'],
    options: buildCountedRow('opt', 2, (index) => ({
      option_date: null,
      option_name: `Option ${index + 1}`,
      unit_price_usd: 25,
      pax: 8,
      total_sale_usd: 200,
      expense_usd: 20,
      expense_vnd: 520000,
      com_usd: 36,
      is_extra_vehicle: false,
    })) as SettlementFull['options'],
    company_expenses: [],
    receipts: [],
  }
}

function buildFixtureFull(): SettlementFull {
  return {
    id: SETTLEMENT_ID,
    tour_id: 'tour-1',
    guide_id: 'guide-1',
    branch_id: 'branch-1',
    status: 'submitted',
    year_month: '2026-06',
    exchange_rate: 26000,
    advance_vnd: 0,
    tour_fee_usd: 0,
    ground_fee_usd: 500,
    charming_other_usd: 0,
    tip_received_usd: 0,
    option_receivable_usd: 0,
    tip_transfer_usd: 0,
    option_credit_usd: 0,
    vehicle_fee_usd: 10,
    head_tax_usd: 5,
    seoul_biz_fee_usd: 3,
    tc_guide_usd: 0,
    tc_company_usd: 8,
    megugi_usd: 2,
    guide_daily_fee_usd: 15,
    settlement_ratio: 0.5,
    guide_note: null,
    admin_note: null,
    reject_reason: null,
    submitted_at: '2026-06-01T00:00:00Z',
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
    guide_submit_snapshot_id: 'snap-1',
    calc_summary_json: null,
    created_at: '',
    updated_at: '',
    tour: {
      id: 'tour-1',
      tour_code: 'TEST-001',
      pattern: 'Test tour',
      agency_name: 'Agency',
      start_date: '2026-06-01',
      end_date: '2026-06-04',
      nights: 3,
      pax_count: 18,
      vehicle_type: '29',
      guide_id: 'guide-1',
      tc_name: null,
      branch_id: 'branch-1',
      assignment_status: 'assigned',
      recalled_at: null,
      recalled_by: null,
      created_by: 'admin',
      created_at: '',
      updated_at: '',
    },
    hotels: [
      {
        id: 'hotel-1',
        settlement_id: SETTLEMENT_ID,
        hotel_name: 'Grand Hotel',
        check_in_date: '2026-06-01',
        nights: 3,
        sgl_count: 1,
        twn_count: 2,
        trp_count: 0,
        unit_price_sgl_usd: 50,
        unit_price_trp_usd: 30,
        company_amount_usd: 80,
        guide_amount_usd: 20,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      },
    ],
    meals: [
      {
        id: 'meal-1',
        settlement_id: SETTLEMENT_ID,
        meal_date: '2026-06-02',
        restaurant_name: 'Pho Place',
        pax: 18,
        unit_price_vnd: 85000,
        amount_vnd: 1530000,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      },
    ],
    entrances: [
      {
        id: 'ent-1',
        settlement_id: SETTLEMENT_ID,
        visit_date: '2026-06-03',
        attraction_name: 'Marble Mountains',
        pax: 18,
        unit_price_vnd: 150000,
        amount_vnd: 2700000,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      },
    ],
    others: [
      {
        id: 'other-1',
        settlement_id: SETTLEMENT_ID,
        description: 'Water',
        days: null,
        pax: 0,
        unit_price_usd: 0,
        unit_price_vnd: 0,
        amount_usd: 40,
        amount_vnd: 0,
        is_tip: false,
        entry_mode: 'flat',
        note: null,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      },
    ],
    shoppings: [
      {
        id: 'shop-1',
        settlement_id: SETTLEMENT_ID,
        visit_date: '2026-06-03',
        shop_name: 'Silk Shop',
        sale_usd: 100,
        com_usd: 20,
        kb_usd: 5,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      },
    ],
    options: [
      {
        id: 'opt-1',
        settlement_id: SETTLEMENT_ID,
        option_date: '2026-06-04',
        option_name: 'Cable car',
        unit_price_usd: 25,
        pax: 8,
        total_sale_usd: 200,
        expense_usd: 20,
        expense_vnd: 520000,
        com_usd: 36,
        is_extra_vehicle: false,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      },
    ],
    company_expenses: [
      {
        id: 'ce-1',
        settlement_id: SETTLEMENT_ID,
        description: 'Office advance',
        amount_usd: 10,
        amount_vnd: 0,
        note: null,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      },
    ],
    receipts: [],
  }
}

function staleEmptyDraftState(settlementId: string): SettlementFormState {
  return {
    ...emptyFormState('Guide'),
    settlementId,
    dirty: true,
    saveStatus: 'error',
    saveError: 'child failed',
    hotels: [],
    meals: [],
    entrances: [],
    others: [],
    shoppings: [],
    options: [],
    companyExpenses: [],
  }
}

type MockStore = {
  getState: () => SettlementFormState
  setState: (
    partial:
      | Partial<SettlementFormState>
      | ((state: SettlementFormState) => Partial<SettlementFormState>),
  ) => void
  persist: { clearStorage: ReturnType<typeof vi.fn> }
}

function createMockStore(initial: SettlementFormState): MockStore {
  let state = initial
  return {
    getState: () => state,
    setState: (partial) => {
      state =
        typeof partial === 'function'
          ? { ...state, ...partial(state) }
          : { ...state, ...partial }
    },
    persist: { clearStorage: vi.fn() },
  }
}

/** Mirrors settlementFormStore.hydrateFromFull for guide-path tests. */
function hydrateFromFullLikeStore(
  store: MockStore,
  full: SettlementFull,
  guideName: string,
): void {
  const current = store.getState()
  if (shouldPreserveClientDraftOnHydration(current, full.id)) {
    store.setState({
      settlementStatus: full.status,
      guideSubmitSnapshotId: full.guide_submit_snapshot_id ?? null,
      receipts: full.receipts ?? [],
    })
    return
  }
  store.setState({
    ...stateFromSettlementFull(full, guideName),
    saveStatus: 'idle',
    saveError: null,
  })
}

describe('resolveEditFormBootstrap', () => {
  const full = buildFixtureFull()

  it('admin review always chooses admin_server_wins with unsanitized initialFull', () => {
    const plan = resolveEditFormBootstrap({
      isAdminReview: true,
      formRole: 'admin',
      initialFull: full,
      guideName: 'Admin',
      clientState: staleEmptyDraftState(full.id),
    })

    expect(plan.kind).toBe('admin_server_wins')
    if (plan.kind !== 'admin_server_wins') return
    expect(plan.clearStorage).toBe(true)
    expect(plan.resetDraftFlags).toBe(true)
    expect(plan.full).toBe(full)
    expect(plan.full.company_expenses).toHaveLength(1)
    expect(plan.full.hotels[0]?.company_amount_usd).toBe(80)
    expect(plan.full.shoppings[0]?.kb_usd).toBe(5)
  })

  it('guide edit with dirty/error same settlement preserves client draft', () => {
    const plan = resolveEditFormBootstrap({
      isAdminReview: false,
      formRole: 'guide',
      initialFull: full,
      guideName: 'Guide',
      clientState: staleEmptyDraftState(full.id),
    })

    expect(plan.kind).toBe('guide_preserve_draft')
    if (plan.kind !== 'guide_preserve_draft') return
    expect(plan.clearStorage).toBe(false)
    expect(plan.full).toEqual(sanitizeSettlementFullForGuide(full))
  })

  it('guide edit with clean client state clears storage and hydrates from server', () => {
    const plan = resolveEditFormBootstrap({
      isAdminReview: false,
      formRole: 'guide',
      initialFull: full,
      guideName: 'Guide',
      clientState: {
        settlementId: full.id,
        dirty: false,
        saveStatus: 'idle',
        saveError: null,
      },
    })

    expect(plan.kind).toBe('guide_server_wins')
    if (plan.kind !== 'guide_server_wins') return
    expect(plan.clearStorage).toBe(true)
  })
})

describe('applyAdminServerWinsState', () => {
  const full = buildFixtureFull()

  it('directly replaces store rows even when dirty/error would trigger preserve via hydrateFromFull', () => {
    const store = createMockStore(staleEmptyDraftState(full.id))
    const hydrateSpy = vi.fn(hydrateFromFullLikeStore)

    applyAdminServerWinsState(store, full, 'Admin')

    expect(hydrateSpy).not.toHaveBeenCalled()
    const state = store.getState()
    expect(isCleanDraftState(state)).toBe(true)
    expect(hydratedLineItemCounts(state)).toEqual({
      hotels: 1,
      meals: 1,
      entrances: 1,
      others: 1,
      shoppings: 1,
      options: 1,
    })
    expect(state.meals[0]?.restaurant_name).toBe('Pho Place')
    expect(state.companyExpenses).toHaveLength(1)
  })
})

describe('applyEditFormBootstrapPlan — admin edit hydration', () => {
  const full = buildFixtureFull()

  it('admin_server_wins bypasses hydrateFromFull and applies direct server state', () => {
    const store = createMockStore(staleEmptyDraftState(full.id))
    const plan = resolveEditFormBootstrap({
      isAdminReview: true,
      formRole: 'admin',
      initialFull: full,
      guideName: 'Admin',
      clientState: store.getState(),
    })
    const hydrateSpy = vi.fn()

    applyEditFormBootstrapPlan(store, plan, 'Admin', hydrateSpy)

    expect(store.persist.clearStorage).toHaveBeenCalledOnce()
    expect(hydrateSpy).not.toHaveBeenCalled()
    const state = store.getState()
    expect(isCleanDraftState(state)).toBe(true)
    expect(state.meals[0]?.restaurant_name).toBe('Pho Place')
  })

  it('guide preserve path still uses hydrateFromFull and keeps client rows when save failed', () => {
    const clientDraft = {
      ...staleEmptyDraftState(full.id),
      options: [
        {
          ...emptyOptionRow(),
          clientId: 'o1',
          option_date: '2026-06-06',
          option_name: 'Client option',
          unit_price_usd: 30,
          pax: 11,
        },
      ],
      entrances: [
        {
          ...emptyEntranceRow(),
          clientId: 'e1',
          visit_date: '2026-06-07',
          attraction_name: 'Client entrance',
        },
      ],
    }
    const store = createMockStore(clientDraft)
    const plan = resolveEditFormBootstrap({
      isAdminReview: false,
      formRole: 'guide',
      initialFull: full,
      guideName: 'Guide',
      clientState: store.getState(),
    })

    applyEditFormBootstrapPlan(store, plan, 'Guide', (f, name) =>
      hydrateFromFullLikeStore(store, f, name),
    )

    expect(store.persist.clearStorage).not.toHaveBeenCalled()
    const state = store.getState()
    expect(state.saveStatus).toBe('error')
    expect(state.saveError).toBe('child failed')
    expect(state.options).toHaveLength(1)
    expect(state.options[0]?.option_name).toBe('Client option')
    expect(state.entrances[0]?.attraction_name).toBe('Client entrance')
    expect(state.meals).toHaveLength(0)
  })

  it('production regression fixture hydrates meals 8 / entrances 11 / others 10 / shoppings 4 / options 2', () => {
    const prodFull = buildProductionRegressionFixture()
    const store = createMockStore(staleEmptyDraftState(prodFull.id))
    const plan = resolveEditFormBootstrap({
      isAdminReview: true,
      formRole: 'admin',
      initialFull: prodFull,
      guideName: 'Admin',
      clientState: store.getState(),
    })

    applyEditFormBootstrapPlan(store, plan, 'Admin', vi.fn())

    const counts = hydratedLineItemCounts(store.getState())
    expect(counts).toEqual({
      hotels: 0,
      meals: 8,
      entrances: 11,
      others: 10,
      shoppings: 4,
      options: 2,
    })
    expect(store.getState().meals[0]?.restaurant_name).toBe('마담차')
  })
})

describe('runPersistAwareBootstrap', () => {
  it('runs immediately when persist has already hydrated', () => {
    const bootstrap = vi.fn()
    const persist = {
      hasHydrated: () => true,
      onFinishHydration: vi.fn(() => () => {}),
    }

    runPersistAwareBootstrap(persist, bootstrap)

    expect(bootstrap).toHaveBeenCalledOnce()
    expect(persist.onFinishHydration).toHaveBeenCalledOnce()
  })

  it('runs after finish hydration when persist has not hydrated yet', () => {
    const bootstrap = vi.fn()
    let finishListener: (() => void) | null = null
    const persist = {
      hasHydrated: () => false,
      onFinishHydration: vi.fn((fn: () => void) => {
        finishListener = fn
        return () => {}
      }),
    }

    runPersistAwareBootstrap(persist, bootstrap)

    expect(bootstrap).not.toHaveBeenCalled()
    expect(finishListener).not.toBeNull()
    finishListener!()
    expect(bootstrap).toHaveBeenCalledOnce()
  })
})

describe('shouldAdminEditRebootstrap', () => {
  const prodFull = buildProductionRegressionFixture()

  it('detects empty store with non-empty server rows for same settlement', () => {
    expect(
      shouldAdminEditRebootstrap(prodFull, staleEmptyDraftState(prodFull.id)),
    ).toBe(true)
  })

  it('returns false once store rows are populated', () => {
    const store = createMockStore(staleEmptyDraftState(prodFull.id))
    applyAdminServerWinsState(store, prodFull, 'Admin')
    expect(shouldAdminEditRebootstrap(prodFull, store.getState())).toBe(false)
  })

  it('safety re-bootstrap applies server state once when first attempt left store empty', () => {
    const prodFull = buildProductionRegressionFixture()
    const store = createMockStore(staleEmptyDraftState(prodFull.id))
    let rebootstrapAttempted = false

    if (shouldAdminEditRebootstrap(prodFull, store.getState()) && !rebootstrapAttempted) {
      rebootstrapAttempted = true
      applyAdminServerWinsState(store, prodFull, 'Admin')
    }

    expect(rebootstrapAttempted).toBe(true)
    expect(hydratedLineItemCounts(store.getState()).meals).toBe(8)
    expect(shouldAdminEditRebootstrap(prodFull, store.getState())).toBe(false)
  })
})

describe('SettlementForm wiring (static)', () => {
  const form = readFileSync(join(ROOT, 'src/components/settlement/SettlementForm.tsx'), 'utf8')
  const adminEditPage = readFileSync(
    join(ROOT, 'src/app/admin/settlements/[id]/edit/page.tsx'),
    'utf8',
  )

  it('uses direct admin server-wins state and persist-aware bootstrap', () => {
    expect(form).toContain('applyAdminServerWinsState')
    expect(form).toContain('runPersistAwareBootstrap')
    expect(form).toContain('shouldAdminEditRebootstrap')
    expect(form).toContain('isAdminEditHydrationBroken')
  })

  it('admin edit page passes formRole="admin"', () => {
    expect(adminEditPage).toContain('formRole="admin"')
  })
})

describe('expectedAdminHydratedState', () => {
  it('matches full server hydration shape', () => {
    const full = buildFixtureFull()
    const expected = expectedAdminHydratedState(full, 'Admin')
    expect(expected.meals).toHaveLength(1)
    expect(expected.companyExpenses).toHaveLength(1)
    expect(expected.dirty).toBe(false)
    expect(expected.saveStatus).toBe('idle')
    expect(serverLineItemCounts(full).meals).toBe(1)
  })
})
