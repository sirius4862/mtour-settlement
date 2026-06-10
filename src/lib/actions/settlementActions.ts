'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import {
  GUIDE_LINE_ITEM_TABLES,
  explicitDeleteIdsFromDraft,
  persistGuideLineItemTable,
} from '@/lib/settlement/guide-line-item-persist'
import { buildSnapshotInsertRow } from '@/lib/settlement/guide-workflow-writes'
import { resolveSettlementOperatingBranchId } from '@/lib/guide/assignment'
import {
  EMPTY_GUIDE_DASHBOARD_SETTLEMENTS,
  GUIDE_DASHBOARD_RECENT_LIMIT,
  GUIDE_DASHBOARD_SETTLEMENT_SELECT,
  type GuideDashboardSettlements,
} from '@/lib/guide/dashboard-settlements'
import { createClient } from '@/lib/supabase/server'
import { GUIDE_READ } from '@/lib/supabase/guide-read-tables'
import type {
  SettlementWithTour,
  SettlementFull,
  Tour,
  SettlementStatus,
  SettlementFieldChange,
  UserRole,
} from '@/types'
import {
  buildEntranceDbRows,
  buildCompanyExpenseDbRows,
  buildHotelDbRows,
  buildMealDbRows,
  buildOptionDbRows,
  buildOtherDbRows,
  buildShoppingDbRows,
  type SettlementDraftPayload,
  type SettlementSyncPayload,
  sanitizeGuideDraftPayload,
  sanitizeAdminDraftPayload,
  isMissingDbColumnError,
  splitDbRowsForPersist,
  buildAdminSettlementHeaderPatch,
} from '@/lib/settlement/mappers'
import type { DraftCompanyExpenseRow } from '@/lib/settlement/form-types'
import {
  buildSnapshotPayload,
  diffSnapshotPayloads,
  filterGuideConfirmationChanges,
  parseSnapshotPayload,
  sanitizeSettlementFullForGuide,
  sanitizeSettlementForGuide,
  sanitizeSettlementSyncForGuide,
} from '@/lib/settlement/snapshot'
import type { FieldChangeDraft, SnapshotPayload } from '@/lib/settlement/snapshot'
import { externalReceivableDbFields } from '@/lib/settlement/external-receivable'
import {
  assertAdminReviewAction,
  assertAdminSaveSettlement,
  assertAdminSendForConfirmation,
  assertCanRecallSettlement,
  assertGuideConfirmAction,
  assertSingleOptimisticUpdate,
  canAdminSendForConfirmation,
  isPgUniqueViolation,
  RECALL_TARGET_STATUS,
  SETTLEMENT_DUPLICATE_TOUR_ERROR,
} from '@/lib/settlement/status-guards'
import {
  canOperationalAdminReview,
  isAdminTier,
  settlementRequiresReconfirmAfterMasterAdminEdit,
} from '@/lib/auth/permissions'
import { resolveAdminRegionFilter, type AdminRegionScope } from '@/lib/region/permissions'
import {
  assertAdminCanAccessSettlementBranch,
  evaluateAdminSettlementReadAccess,
} from '@/lib/region/settlement-access'
import {
  ADMIN_SETTLEMENT_PAGE_SIZE,
  ADMIN_SETTLEMENT_SELECT,
  ACTION_NEEDED_STATUSES,
  aggregateSettlementStatusCounts,
  adminSettlementSearchHasMatches,
  buildAdminSettlementSearchOrFilter,
  escapeIlikePattern,
  expandAdminDashboardProgressStatuses,
  expandWorkflowStatusFilter,
  paginateSortedAdminSettlementRows,
  resolveAdminSettlementSearchScope,
  shouldApplyAdminSettlementDateFilter,
  sortActionNeededSettlements,
  type AdminSettlementListFilters,
  type AdminSettlementListItem,
  type AdminSettlementsPageResult,
} from '@/lib/admin/settlement-list'
import {
  ADMIN_UNSUBMITTED_TOUR_SELECT,
  isAdminUnsubmittedOnlyStatusFilter,
  mergeAdminUnsubmittedListItems,
  type AdminUnsubmittedTourRow,
} from '@/lib/admin/settlement-unsubmitted-list'
import {
  GUIDE_SETTLEMENT_HISTORY_PAGE_SIZE,
  expandGuideHistoryStatusFilter,
  normalizeGuideHistoryPage,
  parseGuideHistoryPeriod,
  resolveGuideHistoryDateRange,
  type GuideSettlementHistoryFilters,
  type GuideSettlementHistoryResult,
} from '@/lib/guide/settlement-history'
import {
  logServerError,
  SAVE_SETTLEMENT_GENERIC_ERROR,
  SUBMIT_SETTLEMENT_GENERIC_ERROR,
  SUBMIT_SETTLEMENT_VERIFY_ERROR,
} from '@/lib/server/safe-errors'
import {
  validateSettlementDraftPayload,
  validateSettlementItemsPayload,
} from '@/lib/settlement/server-payload-validation'

// ── 인증 헬퍼 ─────────────────────────────────────────────────

async function getProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles').select('id,role,branch_id').eq('id', user.id).single()
  return data as { id: string; role: UserRole; branch_id: string | null } | null
}

async function getAdminRegionScope(): Promise<AdminRegionScope | null> {
  const profile = await getProfile()
  if (!profile || !isAdminTier(profile.role)) return null
  return { role: profile.role, assignedRegionId: profile.branch_id }
}

async function resolveSettlementRegionFilter(
  filters?: AdminSettlementListFilters,
): Promise<string | undefined> {
  const scope = await getAdminRegionScope()
  if (!scope) return undefined
  return resolveAdminRegionFilter(scope, filters?.regionId)
}

/** Admin/master read-write gate — settlements.branch_id only (not guide home branch). */
async function requireAdminSettlementRegionAccess(
  supabase: SupabaseClient,
  settlementId: string,
): Promise<{ ok: true; branchId: string } | { ok: false; error: string }> {
  const scope = await getAdminRegionScope()
  if (!scope) return { ok: false, error: '관리자 권한이 필요합니다.' }

  const { data, error } = await supabase
    .from('settlements')
    .select('branch_id')
    .eq('id', settlementId)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, error: '정산서를 찾을 수 없습니다.' }
  }

  const branchId = data.branch_id as string
  const guard = assertAdminCanAccessSettlementBranch(scope, branchId)
  if (!guard.ok) return guard
  return { ok: true, branchId }
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function insertSnapshot(
  supabase: SupabaseClient,
  params: {
    settlementId: string
    kind: 'guide_submit' | 'admin_pre_confirm' | 'guide_confirmed'
    payload: SnapshotPayload
    createdBy: string
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { id, row } = buildSnapshotInsertRow({
    settlementId: params.settlementId,
    kind: params.kind,
    payload: params.payload,
    createdBy: params.createdBy,
  })

  const { error } = await supabase.from('settlement_snapshots').insert(row)

  if (error) return { ok: false, error: error.message ?? '스냅샷 저장 실패' }
  return { ok: true, id }
}

async function insertAuditEvent(
  supabase: SupabaseClient,
  params: {
    settlementId: string
    actorId: string
    actorRole: UserRole
    action: import('@/types').SettlementAuditAction
    fromStatus: SettlementStatus | null
    toStatus: SettlementStatus | null
    note?: string | null
  },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('settlement_audit_events').insert({
    settlement_id: params.settlementId,
    actor_id: params.actorId,
    actor_role: params.actorRole,
    action: params.action,
    from_status: params.fromStatus,
    to_status: params.toStatus,
    note: params.note ?? null,
  })
  if (error) {
    return { ok: false, error: error.message || '감사 로그 저장 실패' }
  }
  return { ok: true }
}

function revalidateSettlementPaths(id: string) {
  revalidatePath('/guide/settlements')
  revalidatePath(`/guide/settlements/${id}`)
  revalidatePath(`/guide/settlements/${id}/confirm`)
  revalidatePath('/admin/settlements')
  revalidatePath(`/admin/settlements/${id}`)
  revalidatePath(`/admin/settlements/${id}/edit`)
  revalidatePath('/admin')
  revalidatePath('/guide')
}

async function persistSettlementCalcSummary(
  supabase: SupabaseClient,
  settlementId: string,
  full?: SettlementFull | null,
): Promise<void> {
  const settlement = full ?? (await getSettlementFull(settlementId))
  if (!settlement) return
  const summary = buildSnapshotPayload(settlement).calc_summary
  await supabase
    .from('settlements')
    .update({ calc_summary_json: summary })
    .eq('id', settlementId)
}

// ── 투어 조회 ──────────────────────────────────────────────────

/** 가이드의 미정산 배정 투어 목록 (기간 제한 없음 — 지연 제출 backlog 포함). */
export async function getAvailableTours(): Promise<Tour[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: tours } = await supabase
    .from('tours').select('*')
    .eq('guide_id', user.id)
    .neq('assignment_status', 'recalled')
    .order('start_date', { ascending: false })

  if (!tours?.length) return []

  const { data: used } = await supabase
    .from(GUIDE_READ.settlements).select('tour_id').eq('guide_id', user.id)

  const usedSet = new Set((used ?? []).map((r: { tour_id: string }) => r.tour_id))
  return (tours as Tour[]).filter((t) => !usedSet.has(t.id))
}

const LINE_ITEM_TABLES = [
  'hotel_items',
  'meal_items',
  'entrance_items',
  'other_expense_items',
  'shopping_items',
  'option_items',
  'receipts',
] as const

type LineItemTable = (typeof LINE_ITEM_TABLES)[number]

function tableForAudience(base: 'settlements' | LineItemTable, useGuideRead: boolean): string {
  if (!useGuideRead) return base
  if (base === 'settlements') return GUIDE_READ.settlements
  return GUIDE_READ[base]
}

async function shouldUseGuideReadTables(force?: 'guide' | 'admin'): Promise<boolean> {
  if (force === 'admin') return false
  if (force === 'guide') return true
  const profile = await getProfile()
  return profile?.role === 'guide'
}

/** 가이드 본인 정산서 목록 */
export async function getMySettlements(): Promise<SettlementWithTour[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const useGuideRead = await shouldUseGuideReadTables('guide')

  const { data } = await supabase
    .from(tableForAudience('settlements', useGuideRead))
    .select(
      'id,tour_id,guide_id,branch_id,status,reject_reason,guide_confirmed_at,calc_summary_json,created_at,updated_at,tour:tours(id,tour_code,pattern,start_date,end_date)',
    )
    .eq('guide_id', user.id)
    .order('created_at', { ascending: false })

  return (data ?? []).map((row) =>
    sanitizeSettlementForGuide(row as unknown as SettlementWithTour),
  ) as SettlementWithTour[]
}

/** 가이드 대시보드 — 작업 큐·최근 정산서만 bounded 로드 (전체 이력 미조회). */
export async function getGuideDashboardSettlements(): Promise<GuideDashboardSettlements> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return EMPTY_GUIDE_DASHBOARD_SETTLEMENTS

  const useGuideRead = await shouldUseGuideReadTables('guide')
  const table = tableForAudience('settlements', useGuideRead)

  const baseQuery = () =>
    supabase
      .from(table)
      .select(GUIDE_DASHBOARD_SETTLEMENT_SELECT)
      .eq('guide_id', user.id)

  const [draftRes, editRes, pendingRes, recentRes] = await Promise.all([
    baseQuery().eq('status', 'draft').order('created_at', { ascending: false }),
    baseQuery()
      .eq('status', 'edit_requested')
      .order('created_at', { ascending: false }),
    baseQuery()
      .eq('status', 'pending_guide_confirmation')
      .is('guide_confirmed_at', null)
      .order('created_at', { ascending: false }),
    baseQuery()
      .order('created_at', { ascending: false })
      .limit(GUIDE_DASHBOARD_RECENT_LIMIT),
  ])

  const mapRows = (rows: unknown[] | null | undefined): SettlementWithTour[] =>
    (rows ?? []).map((row) =>
      sanitizeSettlementForGuide(row as SettlementWithTour),
    ) as SettlementWithTour[]

  if (draftRes.error) {
    console.error('getGuideDashboardSettlements draft:', draftRes.error.message)
  }
  if (editRes.error) {
    console.error('getGuideDashboardSettlements edit_requested:', editRes.error.message)
  }
  if (pendingRes.error) {
    console.error('getGuideDashboardSettlements pending:', pendingRes.error.message)
  }
  if (recentRes.error) {
    console.error('getGuideDashboardSettlements recent:', recentRes.error.message)
  }

  return {
    draft: mapRows(draftRes.data),
    editRequested: mapRows(editRes.data),
    pendingConfirmation: mapRows(pendingRes.data),
    recent: mapRows(recentRes.data),
  }
}

/** 가이드 본인 정산서 이력 검색 (소유권은 guide_id로 강제). */
export async function getMySettlementHistory(
  filters?: GuideSettlementHistoryFilters,
): Promise<GuideSettlementHistoryResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const pageSize = filters?.pageSize ?? GUIDE_SETTLEMENT_HISTORY_PAGE_SIZE
  const page = normalizeGuideHistoryPage(filters?.page)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  if (!user) return { items: [], total: 0, page, pageSize, totalPages: 0 }

  const period = parseGuideHistoryPeriod(filters?.period)
  const range = resolveGuideHistoryDateRange({
    period,
    from: filters?.from,
    to: filters?.to,
  })
  const search = filters?.search?.trim()
  let matchingTourIds: string[] | null = null

  if (range.from || range.to || search) {
    let tourQuery = supabase
      .from('tours')
      .select('id')
      .eq('guide_id', user.id)

    if (range.from) tourQuery = tourQuery.gte('start_date', range.from)
    if (range.to) tourQuery = tourQuery.lte('start_date', range.to)
    if (search) {
      const pattern = `%${escapeIlikePattern(search)}%`
      tourQuery = tourQuery.or(`pattern.ilike.${pattern},tour_code.ilike.${pattern}`)
    }

    const { data: tours, error } = await tourQuery
    if (error) {
      console.error('getMySettlementHistory tours:', error.message)
      return { items: [], total: 0, page, pageSize, totalPages: 0 }
    }

    matchingTourIds = (tours ?? []).map((t) => t.id as string)
    if (matchingTourIds.length === 0) {
      return { items: [], total: 0, page, pageSize, totalPages: 0 }
    }
  }

  const useGuideRead = await shouldUseGuideReadTables('guide')
  let q = supabase
    .from(tableForAudience('settlements', useGuideRead))
    .select('*, tour:tours(*)', { count: 'exact' })
    .eq('guide_id', user.id)
    .order('created_at', { ascending: false })

  const statuses = expandGuideHistoryStatusFilter(filters?.status)
  if (statuses) q = statuses.length === 1 ? q.eq('status', statuses[0]) : q.in('status', statuses)
  if (matchingTourIds) q = q.in('tour_id', matchingTourIds)

  const { data, count, error } = await q.range(from, to)
  if (error) {
    console.error('getMySettlementHistory:', error.message)
    return { items: [], total: 0, page, pageSize, totalPages: 0 }
  }

  const total = count ?? 0
  return {
    items: (data ?? []).map((row) =>
      sanitizeSettlementForGuide(row as SettlementWithTour),
    ) as SettlementWithTour[],
    total,
    page,
    pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  }
}

/** Guide-facing settlement load — DB-redacted view + app-layer sanitize. */
export async function getSettlementFullForGuide(id: string): Promise<SettlementFull | null> {
  const full = await getSettlementFull(id, { audience: 'guide' })
  if (!full) return null
  return sanitizeSettlementFullForGuide(full)
}

/** 정산서 상세 + 모든 항목 */
export async function getSettlementFull(
  id: string,
  options?: { audience?: 'guide' | 'admin' },
): Promise<SettlementFull | null> {
  const supabase = await createClient()
  const useGuideRead = await shouldUseGuideReadTables(options?.audience)

  const { data: s, error: settlementError } = await supabase
    .from(tableForAudience('settlements', useGuideRead))
    .select('*, tour:tours(*)')
    .eq('id', id)
    .single()
  if (settlementError || !s) {
    if (settlementError) {
      console.error('[getSettlementFull] settlements:', settlementError.message)
    }
    return null
  }

  const profile = await getProfile()
  const adminScope = await getAdminRegionScope()
  if (
    evaluateAdminSettlementReadAccess({
      scope: adminScope,
      settlementBranchId: s.branch_id as string,
      callerRole: profile?.role,
      audience: options?.audience,
    }) === 'deny'
  ) {
    return null
  }

  const fetchRows = async (
    table: LineItemTable,
    orderColumn: string,
    ascending = true,
  ) => {
    const { data, error } = await supabase
      .from(tableForAudience(table, useGuideRead))
      .select('*')
      .eq('settlement_id', id)
      .order(orderColumn, { ascending })
    if (error) {
      console.error(`[getSettlementFull] ${table}:`, error.message)
      return []
    }
    return data ?? []
  }

  const [
    hotels, meals, entrances, others, shoppings, optionItems, receipts,
  ] = await Promise.all([
    fetchRows('hotel_items', 'sort_order'),
    fetchRows('meal_items', 'sort_order'),
    fetchRows('entrance_items', 'sort_order'),
    fetchRows('other_expense_items', 'sort_order'),
    fetchRows('shopping_items', 'sort_order'),
    fetchRows('option_items', 'sort_order'),
    fetchRows('receipts', 'created_at'),
  ])

  let companyExpenses: SettlementFull['company_expenses'] = []
  if (!useGuideRead) {
    const { data, error } = await supabase
      .from('company_expense_items')
      .select('*')
      .eq('settlement_id', id)
      .order('sort_order', { ascending: true })
    if (error) {
      console.error('[getSettlementFull] company_expense_items:', error.message)
    } else {
      companyExpenses = data ?? []
    }
  }

  return {
    ...s,
    hotels,
    meals,
    entrances,
    others,
    shoppings,
    options: optionItems,
    company_expenses: companyExpenses,
    receipts,
  } as SettlementFull
}

function emptyAdminSettlementsPage(
  page: number,
  pageSize: number,
): AdminSettlementsPageResult {
  return { items: [], total: 0, page, pageSize, totalPages: 0 }
}

/** 미제출 — assigned tours with no settlement row and existing draft settlements. */
async function getAdminUnsubmittedSettlements(
  supabase: SupabaseClient,
  filters: AdminSettlementListFilters,
  page: number,
  pageSize: number,
  regionId: string | undefined,
): Promise<AdminSettlementsPageResult> {
  let tourQuery = supabase
    .from('tours')
    .select(ADMIN_UNSUBMITTED_TOUR_SELECT)
    .not('guide_id', 'is', null)
    .neq('assignment_status', 'recalled')

  if (regionId) tourQuery = tourQuery.eq('branch_id', regionId)

  const search = filters.search?.trim()
  if (search) {
    const scope = await resolveAdminSettlementSearchScope(supabase, search)
    if (!adminSettlementSearchHasMatches(scope)) {
      return emptyAdminSettlementsPage(page, pageSize)
    }
    const orFilter = buildAdminSettlementSearchOrFilter(scope, 'tours')
    if (orFilter) tourQuery = tourQuery.or(orFilter)
  }

  const { data: tourRows, error: tourError } = await tourQuery
  if (tourError) {
    console.error('getAdminUnsubmittedSettlements tours:', tourError.message)
    return emptyAdminSettlementsPage(page, pageSize)
  }

  const tours = (tourRows ?? []) as unknown as AdminUnsubmittedTourRow[]
  if (tours.length === 0) return emptyAdminSettlementsPage(page, pageSize)

  const tourIds = tours.map((t) => t.id)
  const { data: settlementRows, error: settlementError } = await supabase
    .from('settlements')
    .select(ADMIN_SETTLEMENT_SELECT)
    .in('tour_id', tourIds)

  if (settlementError) {
    console.error('getAdminUnsubmittedSettlements settlements:', settlementError.message)
    return emptyAdminSettlementsPage(page, pageSize)
  }

  const merged = mergeAdminUnsubmittedListItems(
    tours,
    (settlementRows ?? []) as unknown as AdminSettlementListItem[],
    search,
  )

  return paginateSortedAdminSettlementRows(merged, { page, pageSize })
}

/** 관리자 정산서 목록 (페이지네이션 + 검색) */
export async function getAdminSettlements(
  filters?: AdminSettlementListFilters,
): Promise<AdminSettlementsPageResult> {
  const supabase = await createClient()
  const pageSize = filters?.pageSize ?? ADMIN_SETTLEMENT_PAGE_SIZE
  const page = Math.max(1, filters?.page ?? 1)

  const regionId = await resolveSettlementRegionFilter(filters)

  if (
    isAdminUnsubmittedOnlyStatusFilter(filters?.status)
  ) {
    return getAdminUnsubmittedSettlements(supabase, filters ?? {}, page, pageSize, regionId)
  }

  let q = supabase
    .from('settlements')
    .select(ADMIN_SETTLEMENT_SELECT, { count: 'exact' })

  if (regionId) q = q.eq('branch_id', regionId)

  if (
    filters?.startDate &&
    filters?.endDate &&
    shouldApplyAdminSettlementDateFilter(filters)
  ) {
    let tourDateQuery = supabase
      .from('tours')
      .select('id')
      .gte('start_date', filters.startDate)
      .lte('start_date', filters.endDate)

    if (regionId) tourDateQuery = tourDateQuery.eq('branch_id', regionId)

    const { data: toursInRange, error: toursInRangeError } = await tourDateQuery

    if (toursInRangeError) {
      console.error('getAdminSettlements tours date range:', toursInRangeError.message)
      return { items: [], total: 0, page, pageSize, totalPages: 0 }
    }

    const tourIdsInRange = (toursInRange ?? []).map((t) => t.id as string)
    if (tourIdsInRange.length === 0) {
      return { items: [], total: 0, page, pageSize, totalPages: 0 }
    }
    q = q.in('tour_id', tourIdsInRange)
  } else if (filters?.yearMonth) {
    q = q.eq('year_month', filters.yearMonth)
  }

  if (filters?.status) {
    const statuses = expandWorkflowStatusFilter(filters.status)
    q = statuses.length === 1 ? q.eq('status', statuses[0]) : q.in('status', [...statuses])
  } else if (filters?.dashboardProgressOnly) {
    const statuses = expandAdminDashboardProgressStatuses()
    q = q.in('status', [...statuses])
  }

  const search = filters?.search?.trim()
  if (search) {
    const scope = await resolveAdminSettlementSearchScope(supabase, search)
    if (!adminSettlementSearchHasMatches(scope)) {
      return { items: [], total: 0, page, pageSize, totalPages: 0 }
    }
    const orFilter = buildAdminSettlementSearchOrFilter(scope, 'settlements')
    if (orFilter) q = q.or(orFilter)
  }

  const { data, count, error } = await q
  if (error) {
    console.error('getAdminSettlements:', error.message)
    return { items: [], total: 0, page, pageSize, totalPages: 0 }
  }

  return paginateSortedAdminSettlementRows(
    (data ?? []) as unknown as AdminSettlementListItem[],
    { page, pageSize, total: count ?? 0 },
  )
}

/** 대시보드 처리 필요 큐 (우선순위 정렬) */
export async function getAdminActionQueue(limit = 10): Promise<AdminSettlementListItem[]> {
  const supabase = await createClient()
  const regionId = await resolveSettlementRegionFilter()

  let q = supabase
    .from('settlements')
    .select(ADMIN_SETTLEMENT_SELECT)
    .in('status', [...ACTION_NEEDED_STATUSES])
    .order('updated_at', { ascending: false })
    .limit(Math.max(limit * 5, 50))

  if (regionId) q = q.eq('branch_id', regionId)

  const { data, error } = await q

  if (error) {
    console.error('getAdminActionQueue:', error.message)
    return []
  }

  return sortActionNeededSettlements((data ?? []) as unknown as AdminSettlementListItem[]).slice(0, limit)
}

/** 대시보드 상태 집계 — scoped by admin region when assigned */
export async function getAdminDashboardStats(filters?: AdminSettlementListFilters): Promise<
  { status: SettlementStatus; count: number }[]
> {
  const supabase = await createClient()
  const regionId = await resolveSettlementRegionFilter(filters)

  let q = supabase.from('settlements').select('status')
  if (regionId) q = q.eq('branch_id', regionId)
  if (filters?.yearMonth) q = q.eq('year_month', filters.yearMonth)

  const { data, error } = await q

  if (error) {
    console.error('getAdminDashboardStats:', error.message)
    return aggregateSettlementStatusCounts([])
  }

  const stats = aggregateSettlementStatusCounts(data ?? [])
  const unsubmitted = await getAdminUnsubmittedSettlements(
    supabase,
    { regionId: filters?.regionId },
    1,
    1,
    regionId,
  )

  return stats.map((row) =>
    row.status === 'draft' ? { ...row, count: unsubmitted.total } : row,
  )
}

// ── 정산서 생성 / 임시저장 ─────────────────────────────────────

export async function upsertSettlement(payload: {
  id?: string
  tour_id: string
  exchange_rate: number
  advance_vnd: number
  tour_fee_usd: number
  ground_fee_usd: number
  charming_other_usd: number
  tip_received_usd: number
  option_receivable_usd: number
  tip_transfer_usd: number
  option_credit_usd: number
  vehicle_fee_usd: number
  head_tax_usd: number
  seoul_biz_fee_usd: number
  tc_guide_usd: number
  tc_company_usd: number
  megugi_usd: number
  guide_daily_fee_usd: number
  settlement_ratio: number
  guide_note: string | null
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const profile = await getProfile()
  if (!profile) return { ok: false, error: '로그인이 필요합니다.' }
  if (profile.role !== 'guide') return { ok: false, error: '가이드 권한이 필요합니다.' }
  if (!profile.branch_id) return { ok: false, error: '지사 정보가 없습니다.' }

  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('start_date, branch_id, guide_id, assignment_status')
    .eq('id', payload.tour_id)
    .single()
  if (!tour) return { ok: false, error: '투어를 찾을 수 없습니다.' }
  if (tour.assignment_status === 'recalled') {
    return { ok: false, error: '배정이 회수된 투어입니다. 정산서를 작성할 수 없습니다.' }
  }

  const branchResult = resolveSettlementOperatingBranchId(
    {
      branch_id: tour.branch_id as string,
      guide_id: tour.guide_id as string,
    },
    profile.id,
  )
  if (!branchResult.ok) return { ok: false, error: branchResult.error }

  const { id: _omitId, ...headerFields } = payload
  const base = {
    ...headerFields,
    guide_id: profile.id,
    branch_id: branchResult.branchId,
    year_month: (tour.start_date as string).slice(0, 7),
  }

  type WriteResult = { error: { message: string; code?: string } | null; id?: string }

  const findExistingSettlementForTour = async () => {
    const { data } = await supabase
      .from('settlements')
      .select('id')
      .eq('tour_id', payload.tour_id)
      .eq('guide_id', profile.id)
      .maybeSingle()
    return data as { id: string } | null
  }

  if (!payload.id) {
    const existingForTour = await findExistingSettlementForTour()
    if (existingForTour) {
      return { ok: false, id: existingForTour.id, error: SETTLEMENT_DUPLICATE_TOUR_ERROR }
    }
  }

  const writeSettlement = async (row: typeof base): Promise<WriteResult> => {
    if (payload.id) {
      const { error } = await supabase
        .from('settlements')
        .update(row)
        .eq('id', payload.id)
        .eq('guide_id', profile.id)
        .in('status', ['draft', 'rejected', 'edit_requested'])
      if (
        error &&
        (error.message.includes('option_receivable_usd') ||
          error.message.includes('tip_transfer_usd'))
      ) {
        const { option_receivable_usd: _or, tip_transfer_usd: _tt, ...legacyRow } = row
        const { error: legacyError } = await supabase
          .from('settlements')
          .update(legacyRow)
          .eq('id', payload.id)
          .eq('guide_id', profile.id)
          .in('status', ['draft', 'rejected', 'edit_requested'])
        return { error: legacyError }
      }
      return { error }
    }

    const newId = randomUUID()
    const { error } = await supabase
      .from('settlements')
      .insert({ ...row, status: 'draft', id: newId })
    if (
      error &&
      (error.message.includes('option_receivable_usd') ||
        error.message.includes('tip_transfer_usd'))
    ) {
      const { option_receivable_usd: _or, tip_transfer_usd: _tt, ...legacyRow } = row
      const legacyId = randomUUID()
      const { error: legacyError } = await supabase
        .from('settlements')
        .insert({ ...legacyRow, status: 'draft', id: legacyId })
      return { error: legacyError, id: legacyError ? undefined : legacyId }
    }
    return { error, id: error ? undefined : newId }
  }

  const writeResult = await writeSettlement(base)
  if (writeResult.error) {
    if (!payload.id && isPgUniqueViolation(writeResult.error)) {
      const existingForTour = await findExistingSettlementForTour()
      return {
        ok: false,
        id: existingForTour?.id,
        error: SETTLEMENT_DUPLICATE_TOUR_ERROR,
      }
    }
    logServerError('[upsertSettlement] write failed', writeResult.error)
    return { ok: false, error: SAVE_SETTLEMENT_GENERIC_ERROR }
  }
  const settlementId = payload.id ?? writeResult.id
  if (!settlementId) return { ok: false, error: '정산서 ID를 확인할 수 없습니다.' }

  revalidatePath('/guide/settlements')
  return { ok: true, id: settlementId }
}

// ── 제출 ──────────────────────────────────────────────────────

export async function submitSettlement(
  id: string,
  draft?: SettlementDraftPayload,
): Promise<{ ok: boolean; error?: string }> {
  const logStep = (step: string, extra?: Record<string, unknown>) => {
    console.error('[submitSettlement]', step, { settlementId: id, ...extra })
  }

  try {
    logStep('start', { hasDraft: !!draft })
    const profile = await getProfile()
    if (!profile) return { ok: false, error: '로그인이 필요합니다.' }
    if (profile.role !== 'guide') return { ok: false, error: '가이드 권한이 필요합니다.' }

    if (draft) {
      if (draft.settlementId && draft.settlementId !== id) {
        return { ok: false, error: '정산서 ID가 일치하지 않습니다.' }
      }
      const saveResult = await saveSettlementDraft({ ...draft, settlementId: id })
      if (!saveResult.ok) {
        logStep('save_before_submit_failed', { error: saveResult.error })
        return { ok: false, error: saveResult.error ?? SAVE_SETTLEMENT_GENERIC_ERROR }
      }
      logStep('save_before_submit_ok')
    }

    const supabase = await createClient()

    const { data: current } = await supabase
      .from(GUIDE_READ.settlements)
      .select('id, status')
      .eq('id', id)
      .eq('guide_id', profile.id)
      .in('status', ['draft', 'rejected', 'edit_requested'])
      .maybeSingle()

    if (!current) return { ok: false, error: '제출할 수 없는 정산서입니다.' }
    logStep('precheck_ok', { status: current.status })

    const full = await getSettlementFull(id, { audience: 'guide' })
    if (!full) return { ok: false, error: '정산서를 찾을 수 없습니다.' }
    logStep('load_ok')

    const payload = buildSnapshotPayload(full)
    const snap = await insertSnapshot(supabase, {
      settlementId: id,
      kind: 'guide_submit',
      payload,
      createdBy: profile.id,
    })
    if (!snap.ok) {
      logStep('snapshot_failed', { error: snap.error })
      logServerError('[submitSettlement] snapshot insert failed', snap.error, { settlementId: id })
      return { ok: false, error: SUBMIT_SETTLEMENT_GENERIC_ERROR }
    }
    logStep('snapshot_ok', { snapshotId: snap.id })

    const now = new Date().toISOString()
    const fromStatus = current.status as SettlementStatus
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()

    const { data: beforeUpdate } = await supabase
      .from(GUIDE_READ.settlements)
      .select('status')
      .eq('id', id)
      .eq('guide_id', profile.id)
      .maybeSingle()

    logStep('before_update', {
      fromStatus,
      beforeStatus: beforeUpdate?.status,
      guideId: profile.id,
      authUid: authUser?.id,
      guideIdMatch: profile.id === authUser?.id,
    })

    logStep('rpc_call', {
      profileId: profile.id,
      guideIdFromPrecheck: profile.id,
      fromStatus,
      snapshotId: snap.id,
      authUid: authUser?.id ?? null,
      guideIdMatch: profile.id === authUser?.id,
    })

    const { data: rpcResult, error: rpcError } = await supabase.rpc('guide_submit_settlement', {
      p_settlement_id: id,
      p_snapshot_id: snap.id,
      p_submitted_at: now,
      p_calc_summary: payload.calc_summary,
    })

    if (rpcError) {
      logStep('settlements_update_failed', {
        via: 'rpc',
        profileId: profile.id,
        guideIdFromPrecheck: profile.id,
        fromStatus,
        code: rpcError.code ?? null,
        error: rpcError.message ?? null,
        details: rpcError.details ?? null,
        hint: rpcError.hint ?? null,
      })
      logServerError('[submitSettlement] guide_submit_settlement RPC failed', rpcError, {
        settlementId: id,
      })
      return { ok: false, error: SUBMIT_SETTLEMENT_GENERIC_ERROR }
    }
    logStep('settlements_update_ok', {
      via: 'rpc',
      profileId: profile.id,
      guideIdFromPrecheck: profile.id,
      fromStatus,
      rpcResult: rpcResult ?? null,
    })

    const { data: verified, error: verifyError } = await supabase
      .from(GUIDE_READ.settlements)
      .select('status')
      .eq('id', id)
      .eq('guide_id', profile.id)
      .maybeSingle()

    logStep('after_update', {
      via: 'rpc',
      verifyError: verifyError?.message ?? null,
      actualStatus: verified?.status ?? null,
      rowsAffectedHint: verified?.status === 'submitted' ? 1 : 0,
    })

    if (verifyError || verified?.status !== 'submitted') {
      logStep('verify_failed', {
        via: 'rpc',
        profileId: profile.id,
        guideIdFromPrecheck: profile.id,
        fromStatus,
        beforeStatus: beforeUpdate?.status,
        verifyError: verifyError?.message ?? null,
        verifyErrorCode: verifyError?.code ?? null,
        verifyErrorDetails: verifyError?.details ?? null,
        verifyErrorHint: verifyError?.hint ?? null,
        actualStatus: verified?.status ?? null,
        rpcResult: rpcResult ?? null,
      })
      logServerError('[submitSettlement] post-RPC verify failed', verifyError ?? 'status mismatch', {
        settlementId: id,
        actualStatus: verified?.status ?? null,
        rpcResult,
      })
      return { ok: false, error: SUBMIT_SETTLEMENT_VERIFY_ERROR }
    }
    logStep('verify_ok')

    const audit = await insertAuditEvent(supabase, {
      settlementId: id,
      actorId: profile.id,
      actorRole: profile.role,
      action: 'guide_submit',
      fromStatus,
      toStatus: 'submitted',
    })
    if (!audit.ok) {
      logStep('audit_failed', { error: audit.error })
      logServerError('[submitSettlement] audit log failed', audit.error, { settlementId: id })
      return { ok: false, error: SUBMIT_SETTLEMENT_GENERIC_ERROR }
    }
    logStep('audit_ok')

    revalidateSettlementPaths(id)
    logStep('complete')
    return { ok: true }
  } catch (err) {
    logServerError('[submitSettlement] unexpected error', err, { settlementId: id })
    logStep('unexpected_error', {
      message: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: SUBMIT_SETTLEMENT_GENERIC_ERROR }
  }
}

// ── 라인 아이템 저장 ───────────────────────────────────────────

async function assertEditableSettlement(
  supabase: Awaited<ReturnType<typeof createClient>>,
  settlementId: string,
  guideId: string,
) {
  const { data } = await supabase
    .from(GUIDE_READ.settlements)
    .select('id, status')
    .eq('id', settlementId)
    .eq('guide_id', guideId)
    .in('status', ['draft', 'rejected', 'edit_requested'])
    .maybeSingle()
  return !!data
}

/** Replace all line items for a settlement (6 tables). */
async function persistSettlementLineItems(
  supabase: SupabaseClient,
  settlementId: string,
  payload: Pick<
    SettlementDraftPayload,
    'hotels' | 'meals' | 'entrances' | 'others' | 'shoppings' | 'options' | 'exchange_rate'
  >,
): Promise<{ ok: boolean; error?: string }> {
  const rate = payload.exchange_rate

  const itemTables: {
    table: (typeof GUIDE_LINE_ITEM_TABLES)[number]
    rows: Record<string, unknown>[]
    deleteIds: string[]
  }[] = [
    {
      table: 'hotel_items',
      rows: buildHotelDbRows(payload.hotels, settlementId),
      deleteIds: explicitDeleteIdsFromDraft(payload.hotels),
    },
    {
      table: 'meal_items',
      rows: buildMealDbRows(payload.meals, settlementId),
      deleteIds: explicitDeleteIdsFromDraft(payload.meals),
    },
    {
      table: 'entrance_items',
      rows: buildEntranceDbRows(payload.entrances, settlementId),
      deleteIds: explicitDeleteIdsFromDraft(payload.entrances),
    },
    {
      table: 'other_expense_items',
      rows: buildOtherDbRows(payload.others, settlementId),
      deleteIds: explicitDeleteIdsFromDraft(payload.others),
    },
    {
      table: 'shopping_items',
      rows: buildShoppingDbRows(payload.shoppings, settlementId),
      deleteIds: explicitDeleteIdsFromDraft(payload.shoppings),
    },
    {
      table: 'option_items',
      rows: buildOptionDbRows(payload.options, settlementId, rate),
      deleteIds: explicitDeleteIdsFromDraft(payload.options),
    },
  ]

  for (const { table, rows, deleteIds } of itemTables) {
    const result = await persistGuideLineItemTable(supabase, table, settlementId, rows, deleteIds)
    if (!result.ok) return result
  }

  return { ok: true }
}

/** Admin-only — guide save must never call this. */
async function persistCompanyExpenseItems(
  supabase: SupabaseClient,
  settlementId: string,
  rows: DraftCompanyExpenseRow[],
): Promise<{ ok: boolean; error?: string }> {
  const dbRows = buildCompanyExpenseDbRows(rows, settlementId)
  const table = 'company_expense_items'
  const { keepIds, toInsert, toUpdate } = splitDbRowsForPersist(dbRows)

  let deleteQuery = supabase.from(table).delete().eq('settlement_id', settlementId)
  if (keepIds.length > 0) {
    deleteQuery = deleteQuery.not('id', 'in', `(${keepIds.map((id) => `"${id}"`).join(',')})`)
  }
  const { error: delErr } = await deleteQuery
  if (delErr) return { ok: false, error: delErr.message }

  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from(table).insert(toInsert)
    if (insErr) return { ok: false, error: insErr.message }
  }

  if (toUpdate.length > 0) {
    const { error: upsertErr } = await supabase.from(table).upsert(toUpdate, { onConflict: 'id' })
    if (upsertErr) return { ok: false, error: upsertErr.message }
  }

  return { ok: true }
}

export async function saveSettlementItems(
  settlementId: string,
  payload: Pick<
    SettlementDraftPayload,
    'hotels' | 'meals' | 'entrances' | 'others' | 'shoppings' | 'options' | 'exchange_rate'
  >,
): Promise<{ ok: boolean; error?: string }> {
  const monetary = validateSettlementItemsPayload(payload)
  if (!monetary.ok) return monetary

  const profile = await getProfile()
  if (!profile) return { ok: false, error: '로그인이 필요합니다.' }
  if (profile.role !== 'guide') return { ok: false, error: '가이드 권한이 필요합니다.' }

  const supabase = await createClient()
  const editable = await assertEditableSettlement(supabase, settlementId, profile.id)
  if (!editable) return { ok: false, error: '수정할 수 없는 정산서입니다.' }

  const result = await persistSettlementLineItems(supabase, settlementId, payload)
  if (!result.ok) {
    logServerError('[saveSettlementItems] persist failed', result.error, { settlementId })
    return { ok: false, error: SAVE_SETTLEMENT_GENERIC_ERROR }
  }

  await persistSettlementCalcSummary(supabase, settlementId)

  revalidatePath('/guide/settlements')
  revalidatePath(`/guide/settlements/${settlementId}`)
  revalidatePath(`/guide/settlements/${settlementId}/edit`)
  return { ok: true }
}

/**
 * DB write path:
 * 1. settlements — upsert header (insert or update draft)
 * 2. hotel_items … option_items — delete-all + insert active rows
 */
export async function saveSettlementDraft(
  payload: SettlementDraftPayload,
): Promise<{
  ok: boolean
  id?: string
  sync?: SettlementSyncPayload
  error?: string
}> {
  const monetary = validateSettlementDraftPayload(payload)
  if (!monetary.ok) return monetary

  let payloadToSave = payload
  let preservedTourFeeUsd = 0
  const profile = await getProfile()
  if (!profile) return { ok: false, error: '로그인이 필요합니다.' }
  const useGuideRead = profile.role === 'guide'

  if (payload.settlementId) {
    const existing = await getSettlementFull(payload.settlementId, {
      audience: useGuideRead ? 'guide' : 'admin',
    })
    if (!existing) {
      return { ok: false, error: '정산서를 불러올 수 없습니다. 저장을 중단했습니다.' }
    }
    preservedTourFeeUsd = existing.tour_fee_usd ?? 0
    payloadToSave = sanitizeGuideDraftPayload(payload, existing)
  } else {
    payloadToSave = sanitizeGuideDraftPayload(payload, null)
  }

  const headerResult = await upsertSettlement({
    id: payloadToSave.settlementId ?? undefined,
    tour_id: payloadToSave.tourId,
    exchange_rate: payloadToSave.exchange_rate,
    advance_vnd: payloadToSave.header.advance_vnd,
    tour_fee_usd: preservedTourFeeUsd,
    ground_fee_usd: payloadToSave.header.ground_fee_usd ?? 0,
    charming_other_usd: payloadToSave.header.charming_other_usd,
    tip_received_usd: payloadToSave.header.tip_received_usd,
    ...externalReceivableDbFields(payloadToSave.header),
    vehicle_fee_usd: payloadToSave.header.vehicle_fee_usd,
    head_tax_usd: payloadToSave.header.head_tax_usd,
    seoul_biz_fee_usd: payloadToSave.header.seoul_biz_fee_usd,
    tc_guide_usd: payloadToSave.header.tc_guide_usd,
    tc_company_usd: payloadToSave.header.tc_company_usd,
    megugi_usd: payloadToSave.header.megugi_usd,
    guide_daily_fee_usd: payloadToSave.header.guide_daily_fee_usd,
    settlement_ratio: payloadToSave.header.settlement_ratio,
    guide_note: payloadToSave.header.guide_note,
  })

  if (!headerResult.ok || !headerResult.id) {
    return { ok: false, id: headerResult.id, error: headerResult.error ?? '헤더 저장 실패' }
  }

  const itemsResult = await saveSettlementItems(headerResult.id, payloadToSave)
  if (!itemsResult.ok) {
    return { ok: false, id: headerResult.id, error: itemsResult.error }
  }

  const full = await getSettlementFull(headerResult.id, { audience: 'guide' })
  if (!full) {
    return { ok: true, id: headerResult.id }
  }

  return {
    ok: true,
    id: headerResult.id,
    sync: sanitizeSettlementSyncForGuide({
      status: full.status,
      receipts: full.receipts,
      hotels: full.hotels,
      meals: full.meals,
      entrances: full.entrances,
      others: full.others,
      company_expenses: full.company_expenses,
      shoppings: full.shoppings,
      options: full.options,
    }),
  }
}

/** Admin/staff saves admin-owned fields during review; status unchanged. */
export async function saveAdminSettlementEdits(
  payload: SettlementDraftPayload,
): Promise<{
  ok: boolean
  sync?: SettlementSyncPayload
  error?: string
}> {
  const monetary = validateSettlementDraftPayload(payload)
  if (!monetary.ok) return monetary

  const profile = await getProfile()
  if (!profile) return { ok: false, error: '로그인이 필요합니다.' }
  if (!isAdminTier(profile.role)) {
    return { ok: false, error: '관리자 권한이 필요합니다.' }
  }

  if (!payload.settlementId) {
    return { ok: false, error: '정산서 ID가 필요합니다.' }
  }

  const supabase = await createClient()
  const regionAccess = await requireAdminSettlementRegionAccess(
    supabase,
    payload.settlementId,
  )
  if (!regionAccess.ok) return { ok: false, error: regionAccess.error }

  const existing = await getSettlementFull(payload.settlementId)
  if (!existing) return { ok: false, error: '정산서를 찾을 수 없습니다.' }

  const statusGuard = assertAdminSaveSettlement(profile.role, existing.status)
  if (!statusGuard.ok) return { ok: false, error: statusGuard.error }

  const sanitized = sanitizeAdminDraftPayload(payload, existing)
  const currentStatus = existing.status

  const headerPatch = buildAdminSettlementHeaderPatch(
    existing,
    sanitized.header,
    profile.id,
  )
  let { error: headerErr } = await supabase
    .from('settlements')
    .update(headerPatch)
    .eq('id', payload.settlementId)
    .eq('status', currentStatus)

  if (headerErr && isMissingDbColumnError(headerErr.message, 'ground_fee_usd')) {
    const legacyPatch = buildAdminSettlementHeaderPatch(
      existing,
      sanitized.header,
      profile.id,
      { legacyGroundFeeInTourFee: true },
    )
    ;({ error: headerErr } = await supabase
      .from('settlements')
      .update(legacyPatch)
      .eq('id', payload.settlementId)
      .eq('status', currentStatus))
  }

  if (headerErr) {
    logServerError('[saveAdminSettlementEdits] header update failed', headerErr, {
      settlementId: payload.settlementId,
    })
    return { ok: false, error: SAVE_SETTLEMENT_GENERIC_ERROR }
  }

  const itemsResult = await persistSettlementLineItems(supabase, payload.settlementId, sanitized)
  if (!itemsResult.ok) {
    logServerError('[saveAdminSettlementEdits] line items failed', itemsResult.error, {
      settlementId: payload.settlementId,
    })
    return { ok: false, error: SAVE_SETTLEMENT_GENERIC_ERROR }
  }

  const companyResult = await persistCompanyExpenseItems(
    supabase,
    payload.settlementId,
    sanitized.companyExpenses ?? [],
  )
  if (!companyResult.ok) {
    logServerError('[saveAdminSettlementEdits] company expenses failed', companyResult.error, {
      settlementId: payload.settlementId,
    })
    return { ok: false, error: SAVE_SETTLEMENT_GENERIC_ERROR }
  }

  await persistSettlementCalcSummary(supabase, payload.settlementId)

  const savedFull = await getSettlementFull(payload.settlementId)
  if (!savedFull) {
    revalidateSettlementPaths(payload.settlementId)
    return { ok: true }
  }

  await insertAuditEvent(supabase, {
    settlementId: payload.settlementId,
    actorId: profile.id,
    actorRole: profile.role,
    action: 'admin_save',
    fromStatus: currentStatus,
    toStatus: currentStatus,
  })

  if (settlementRequiresReconfirmAfterMasterAdminEdit(currentStatus, profile.role)) {
    const reconfirm = await queuePendingGuideConfirmation(supabase, {
      settlementId: payload.settlementId,
      fromStatus: currentStatus,
      actorId: profile.id,
      actorRole: profile.role,
      guideSubmitSnapshotId: existing.guide_submit_snapshot_id,
      activeConfirmationId: existing.active_confirmation_id,
      adminNote: savedFull.admin_note,
      full: savedFull,
      clearGuideConfirmation: true,
    })
    if (!reconfirm.ok) return { ok: false, error: reconfirm.error }
  }

  revalidateSettlementPaths(payload.settlementId)

  return {
    ok: true,
    sync: {
      status: (await getSettlementFull(payload.settlementId))?.status ?? savedFull.status,
      receipts: savedFull.receipts,
      hotels: savedFull.hotels,
      meals: savedFull.meals,
      entrances: savedFull.entrances,
      others: savedFull.others,
      company_expenses: savedFull.company_expenses,
      shoppings: savedFull.shoppings,
      options: savedFull.options,
    },
  }
}

// ── 관리자 액션 ───────────────────────────────────────────────

export async function reviewSettlement(params: {
  id: string
  action: 'approve' | 'reject' | 'request_edit' | 'pay' | 'reopen'
  rejectReason?: string
  adminNote?: string
}): Promise<{ ok: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile || !isAdminTier(profile.role)) {
    return { ok: false, error: '관리자 권한이 필요합니다.' }
  }

  const supabase = await createClient()

  const regionAccess = await requireAdminSettlementRegionAccess(supabase, params.id)
  if (!regionAccess.ok) return { ok: false, error: regionAccess.error }

  const { data: current } = await supabase
    .from('settlements')
    .select('id, status, guide_confirmed_at, guide_submit_snapshot_id, active_confirmation_id')
    .eq('id', params.id)
    .single()

  if (!current) return { ok: false, error: '정산서를 찾을 수 없습니다.' }

  const fromStatus = current.status as SettlementStatus

  const guard = assertAdminReviewAction(
    {
      status: fromStatus,
      guide_confirmed_at: current.guide_confirmed_at,
      guide_submit_snapshot_id: current.guide_submit_snapshot_id,
    },
    params.action,
    profile.role,
  )
  if (!guard.ok) return { ok: false, error: guard.error }

  if (params.action === 'approve') {
    return { ok: false, error: '최종 승인은 더 이상 사용하지 않습니다. 지급완료 처리를 사용하세요.' }
  }

  const now = new Date().toISOString()

  if (params.action === 'reopen') {
    const { data: updatedRows, error } = await supabase
      .from('settlements')
      .update({
        status: 'edit_requested',
        paid_at: null,
        guide_confirmed_at: null,
        guide_confirmed_by: null,
        edit_requested_at: now,
        edit_requested_by: profile.id,
        admin_note: params.adminNote?.trim() || null,
      })
      .eq('id', params.id)
      .eq('status', 'paid')
      .select('id')

    if (error) return { ok: false, error: error.message }
    const rowCheck = assertSingleOptimisticUpdate(updatedRows)
    if (!rowCheck.ok) return { ok: false, error: rowCheck.error }

    await insertAuditEvent(supabase, {
      settlementId: params.id,
      actorId: profile.id,
      actorRole: profile.role,
      action: 'status_change',
      fromStatus: 'paid',
      toStatus: 'edit_requested',
      note: params.adminNote?.trim() || 'master_reopen_paid',
    })

    revalidateSettlementPaths(params.id)
    return { ok: true }
  }

  const updates: Record<string, unknown> = {
    reviewed_by: profile.id,
    admin_note: params.adminNote ?? null,
  }

  let toStatus: SettlementStatus = fromStatus
  let auditAction: import('@/types').SettlementAuditAction = 'status_change'

  switch (params.action) {
    case 'reject':
      return { ok: false, error: '반려는 더 이상 사용하지 않습니다. 수정요청을 사용하세요.' }
    case 'request_edit':
      updates.status = 'edit_requested'
      updates.edit_requested_at = now
      updates.edit_requested_by = profile.id
      toStatus = 'edit_requested'
      auditAction = 'admin_request_edit'
      break
    case 'pay':
      updates.status = 'paid'
      updates.paid_at = now
      toStatus = 'paid'
      auditAction = 'admin_pay'
      break
  }

  const { data: updatedRows, error } = await supabase
    .from('settlements')
    .update(updates)
    .eq('id', params.id)
    .eq('status', fromStatus)
    .select('id')

  if (error) return { ok: false, error: error.message }
  const rowCheck = assertSingleOptimisticUpdate(updatedRows)
  if (!rowCheck.ok) return { ok: false, error: rowCheck.error }

  await insertAuditEvent(supabase, {
    settlementId: params.id,
    actorId: profile.id,
    actorRole: profile.role,
    action: auditAction,
    fromStatus,
    toStatus,
    note: params.rejectReason?.trim() || params.adminNote?.trim() || null,
  })

  revalidateSettlementPaths(params.id)
  return { ok: true }
}

/**
 * Recall (회수) — admin/master pulls back a settlement that was sent to the
 * guide, returning it to admin review (submitted) before final confirmation.
 *
 * Surgical and status-only: it never touches monetary fields, paid_at, or guide
 * confirmation flags, so calculations, payout, and company-profit values are
 * preserved exactly. Region scope (admin) and the paid lock are enforced by the
 * same guards used elsewhere. master_admin may recall across regions.
 */
export async function recallSettlement(
  id: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile || !isAdminTier(profile.role)) {
    return { ok: false, error: '관리자 권한이 필요합니다.' }
  }

  const supabase = await createClient()

  const regionAccess = await requireAdminSettlementRegionAccess(supabase, id)
  if (!regionAccess.ok) return { ok: false, error: regionAccess.error }

  const { data: current } = await supabase
    .from('settlements')
    .select('id, status, guide_confirmed_at')
    .eq('id', id)
    .single()

  if (!current) return { ok: false, error: '정산서를 찾을 수 없습니다.' }

  const fromStatus = current.status as SettlementStatus
  const guard = assertCanRecallSettlement(
    { status: fromStatus, guide_confirmed_at: current.guide_confirmed_at as string | null },
    profile.role,
  )
  if (!guard.ok) return { ok: false, error: guard.error }

  const trimmedReason = reason?.trim() || null

  // Status-only transition. admin_note is intentionally NOT overwritten so
  // admin-entered notes are preserved; the recall reason lives in the audit log.
  const { data: updatedRows, error } = await supabase
    .from('settlements')
    .update({ status: RECALL_TARGET_STATUS, reviewed_by: profile.id })
    .eq('id', id)
    .eq('status', fromStatus)
    .select('id')

  if (error) {
    logServerError('[recallSettlement] update failed', error, { settlementId: id })
    return { ok: false, error: '정산서를 회수할 수 없습니다. 잠시 후 다시 시도해주세요.' }
  }
  const rowCheck = assertSingleOptimisticUpdate(updatedRows)
  if (!rowCheck.ok) return { ok: false, error: rowCheck.error }

  await insertAuditEvent(supabase, {
    settlementId: id,
    actorId: profile.id,
    actorRole: profile.role,
    action: 'status_change',
    fromStatus,
    toStatus: RECALL_TARGET_STATUS,
    note: trimmedReason ? `admin_recall: ${trimmedReason}` : 'admin_recall',
  })

  revalidateSettlementPaths(id)
  return { ok: true }
}

// ── 확인 워크플로 (Phase 2) ───────────────────────────────────

async function resolveConfirmationBeforeSnapshotId(
  supabase: SupabaseClient,
  settlementId: string,
  guideSubmitSnapshotId: string | null,
): Promise<string | null> {
  const { data: confirmedSnap } = await supabase
    .from('settlement_snapshots')
    .select('id')
    .eq('settlement_id', settlementId)
    .eq('kind', 'guide_confirmed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (confirmedSnap?.id as string | undefined) ?? guideSubmitSnapshotId
}

function fieldChangesToRpcJson(changes: FieldChangeDraft[]): Record<string, unknown>[] {
  return changes.map((c) => ({
    field_path: c.field_path,
    excel_ref: c.excel_ref,
    label: c.label,
    owner: c.owner,
    old_value_json: c.old_value_json,
    new_value_json: c.new_value_json,
    old_display: c.old_display,
    new_display: c.new_display,
  }))
}

async function queuePendingGuideConfirmation(
  supabase: SupabaseClient,
  params: {
    settlementId: string
    fromStatus: SettlementStatus
    actorId: string
    actorRole: UserRole
    guideSubmitSnapshotId: string | null
    activeConfirmationId: string | null
    adminNote?: string | null
    full: SettlementFull
    clearGuideConfirmation?: boolean
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const beforeSnapshotId = await resolveConfirmationBeforeSnapshotId(
    supabase,
    params.settlementId,
    params.guideSubmitSnapshotId,
  )
  if (!beforeSnapshotId) {
    return { ok: false, error: '비교 기준 스냅샷이 없습니다.' }
  }

  const { data: beforeRow } = await supabase
    .from('settlement_snapshots')
    .select('payload_json')
    .eq('id', beforeSnapshotId)
    .single()

  const beforePayload = parseSnapshotPayload(beforeRow?.payload_json)
  if (!beforePayload) return { ok: false, error: '비교 기준 스냅샷을 읽을 수 없습니다.' }

  const afterPayload = buildSnapshotPayload(params.full)
  const allChanges = diffSnapshotPayloads(beforePayload, afterPayload)
  const changes = filterGuideConfirmationChanges(allChanges)

  const { id: afterSnapshotId } = buildSnapshotInsertRow({
    settlementId: params.settlementId,
    kind: 'admin_pre_confirm',
    payload: afterPayload,
    createdBy: params.actorId,
  })
  const confirmationId = randomUUID()

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  console.error('[sendForConfirmation] before_admin_send_rpc', {
    settlementId: params.settlementId,
    fromStatus: params.fromStatus,
    actorId: params.actorId,
    actorRole: params.actorRole,
    authUid: authUser?.id,
    changeCount: changes.length,
    confirmationId,
    afterSnapshotId,
    supersedeActiveId: params.activeConfirmationId,
  })

  const { data: rpcRes, error: rpcErr } = await supabase.rpc('admin_send_for_confirmation', {
    p_settlement_id: params.settlementId,
    p_from_status: params.fromStatus,
    p_actor_id: params.actorId,
    p_actor_role: params.actorRole,
    p_before_snapshot_id: beforeSnapshotId,
    p_after_snapshot_id: afterSnapshotId,
    p_after_payload: afterPayload,
    p_after_calc_summary: afterPayload.calc_summary,
    p_confirmation_id: confirmationId,
    p_field_changes: fieldChangesToRpcJson(changes),
    p_change_count: changes.length,
    p_admin_note: params.adminNote?.trim() || params.full.admin_note || null,
    p_r85_before: beforePayload.calc_summary.guide_settlement_usd,
    p_r85_after: afterPayload.calc_summary.guide_settlement_usd,
    p_r87_before: beforePayload.calc_summary.company_grand_total_usd,
    p_r87_after: afterPayload.calc_summary.company_grand_total_usd,
    p_clear_guide_confirmation: params.clearGuideConfirmation ?? false,
  })

  if (rpcErr) {
    console.error('[sendForConfirmation] admin_send_for_confirmation_failed', {
      settlementId: params.settlementId,
      fromStatus: params.fromStatus,
      error: rpcErr.message,
      code: rpcErr.code,
    })
    return { ok: false, error: rpcErr.message }
  }

  if (!rpcRes || typeof rpcRes !== 'object' || (rpcRes as { ok?: boolean }).ok !== true) {
    return { ok: false, error: '확인 요청 생성에 실패했습니다.' }
  }

  console.error('[sendForConfirmation] admin_send_for_confirmation_ok', {
    settlementId: params.settlementId,
    confirmationId: (rpcRes as { confirmation_id?: string }).confirmation_id ?? confirmationId,
  })

  return { ok: true }
}

/** Persist admin note before send-for-confirmation (detail ReviewPanel path). */
export async function saveAdminNoteBeforeConfirmation(
  id: string,
  adminNote?: string,
): Promise<{ ok: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile || !canOperationalAdminReview(profile.role)) {
    return { ok: false, error: '관리자 권한이 필요합니다.' }
  }

  const supabase = await createClient()
  const regionAccess = await requireAdminSettlementRegionAccess(supabase, id)
  if (!regionAccess.ok) return { ok: false, error: regionAccess.error }

  const { data: current } = await supabase
    .from('settlements')
    .select('id, status')
    .eq('id', id)
    .single()

  if (!current) return { ok: false, error: '정산서를 찾을 수 없습니다.' }

  const status = current.status as SettlementStatus
  if (!canAdminSendForConfirmation(status, profile.role)) {
    return { ok: false, error: '제출됨 상태에서만 최종확인을 보낼 수 있습니다.' }
  }

  const { error } = await supabase
    .from('settlements')
    .update({
      admin_note: adminNote?.trim() || null,
      reviewed_by: profile.id,
    })
    .eq('id', id)
    .eq('status', status)

  if (error) return { ok: false, error: error.message }

  revalidateSettlementPaths(id)
  return { ok: true }
}

export interface GuideConfirmationPacket {
  settlement: SettlementFull
  changes: SettlementFieldChange[]
  companyDepositBefore: number | null
  companyDepositAfter: number | null
  guidePayoutBefore: number | null
  guidePayoutAfter: number | null
  adminNote: string | null
}

/** Admin sends settlement to guide for final confirmation after review/edit. */
export async function sendForConfirmation(
  id: string,
  adminNote?: string,
): Promise<{ ok: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile || !canOperationalAdminReview(profile.role)) {
    return { ok: false, error: '관리자 권한이 필요합니다.' }
  }

  const supabase = await createClient()

  const regionAccess = await requireAdminSettlementRegionAccess(supabase, id)
  if (!regionAccess.ok) return { ok: false, error: regionAccess.error }

  const { data: current } = await supabase
    .from('settlements')
    .select('id, status, guide_submit_snapshot_id, active_confirmation_id')
    .eq('id', id)
    .single()

  if (!current) return { ok: false, error: '정산서를 찾을 수 없습니다.' }

  const guard = assertAdminSendForConfirmation(
    current.status as SettlementStatus,
    current.guide_submit_snapshot_id as string | null,
  )
  if (!guard.ok) return { ok: false, error: guard.error }

  const full = await getSettlementFull(id)
  if (!full) return { ok: false, error: '정산서를 찾을 수 없습니다.' }

  const result = await queuePendingGuideConfirmation(supabase, {
    settlementId: id,
    fromStatus: current.status as SettlementStatus,
    actorId: profile.id,
    actorRole: profile.role,
    guideSubmitSnapshotId: current.guide_submit_snapshot_id as string | null,
    activeConfirmationId: current.active_confirmation_id as string | null,
    adminNote: adminNote?.trim() || full.admin_note,
    full,
  })

  if (!result.ok) return { ok: false, error: result.error }

  revalidateSettlementPaths(id)
  return { ok: true }
}

/** Guide accepts admin-reviewed settlement — status stays 최종확인; sets confirmation flags. */
export async function guideConfirm(id: string): Promise<{ ok: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile) return { ok: false, error: '로그인이 필요합니다.' }
  if (profile.role !== 'guide') return { ok: false, error: '가이드 권한이 필요합니다.' }

  const supabase = await createClient()

  const { data: current } = await supabase
    .from(GUIDE_READ.settlements)
    .select('id, status, guide_id, active_confirmation_id, guide_confirmed_at')
    .eq('id', id)
    .single()

  if (!current) return { ok: false, error: '정산서를 찾을 수 없습니다.' }

  if (current.guide_confirmed_at) {
    return { ok: false, error: '이미 최종확인(이상없음) 처리되었습니다.' }
  }

  const guard = assertGuideConfirmAction(
    { status: current.status as SettlementStatus, guide_id: current.guide_id as string },
    profile.id,
    'confirm',
  )
  if (!guard.ok) return { ok: false, error: guard.error }

  if (!current.active_confirmation_id) {
    return { ok: false, error: '활성 확인 요청이 없습니다.' }
  }

  const full = await getSettlementFull(id, { audience: 'guide' })
  if (!full) return { ok: false, error: '정산서를 찾을 수 없습니다.' }

  const payload = buildSnapshotPayload(full)
  const snap = await insertSnapshot(supabase, {
    settlementId: id,
    kind: 'guide_confirmed',
    payload,
    createdBy: profile.id,
  })
  if (!snap.ok) return { ok: false, error: snap.error }

  const now = new Date().toISOString()

  const { data: rpcRes, error: rpcErr } = await supabase.rpc('guide_confirm_settlement', {
    p_settlement_id: id,
    p_confirmed_at: now,
  })
  if (rpcErr) return { ok: false, error: rpcErr.message }
  if (!rpcRes || typeof rpcRes !== 'object' || (rpcRes as { ok?: boolean }).ok !== true) {
    return { ok: false, error: '최종확인 처리에 실패했습니다.' }
  }

  // TODO(audit): True atomic guide confirm requires moving settlement_confirmations
  // update into guide_confirm_settlement RPC via a reviewed DB migration. The app
  // currently calls the RPC first, then updates the confirmation row separately;
  // partial failure can desync — isStuckGuideConfirmation() detects that state.
  const { error: confErr } = await supabase
    .from('settlement_confirmations')
    .update({
      status: 'confirmed',
      confirmed_by: profile.id,
      confirmed_at: now,
    })
    .eq('id', current.active_confirmation_id)
    .eq('status', 'pending')

  if (confErr) return { ok: false, error: confErr.message }

  await insertAuditEvent(supabase, {
    settlementId: id,
    actorId: profile.id,
    actorRole: profile.role,
    action: 'guide_confirm',
    fromStatus: 'pending_guide_confirmation',
    toStatus: 'pending_guide_confirmation',
  })

  revalidateSettlementPaths(id)
  return { ok: true }
}

/** Guide disputes admin changes while pending confirmation. */
export async function guideRequestClarification(
  id: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile) return { ok: false, error: '로그인이 필요합니다.' }
  if (profile.role !== 'guide') return { ok: false, error: '가이드 권한이 필요합니다.' }

  const trimmed = message.trim()
  if (!trimmed) return { ok: false, error: '이의 내용을 입력해주세요.' }

  const supabase = await createClient()

  const { data: current } = await supabase
    .from(GUIDE_READ.settlements)
    .select('id, status, guide_id')
    .eq('id', id)
    .single()

  if (!current) return { ok: false, error: '정산서를 찾을 수 없습니다.' }

  const guard = assertGuideConfirmAction(
    { status: current.status as SettlementStatus, guide_id: current.guide_id as string },
    profile.id,
    'clarification',
  )
  if (!guard.ok) return { ok: false, error: guard.error }

  const now = new Date().toISOString()

  const { error: updErr } = await supabase
    .from('settlements')
    .update({
      status: 'clarification_requested',
      clarification_requested_at: now,
      clarification_message: trimmed,
    })
    .eq('id', id)
    .eq('guide_id', profile.id)
    .eq('status', 'pending_guide_confirmation')

  if (updErr) return { ok: false, error: updErr.message }

  await insertAuditEvent(supabase, {
    settlementId: id,
    actorId: profile.id,
    actorRole: profile.role,
    action: 'guide_clarification',
    fromStatus: 'pending_guide_confirmation',
    toStatus: 'clarification_requested',
    note: trimmed,
  })

  revalidateSettlementPaths(id)
  return { ok: true }
}

/** Load active confirmation packet for guide confirm page. */
export async function getGuideConfirmationPacket(
  id: string,
): Promise<GuideConfirmationPacket | null> {
  const profile = await getProfile()
  if (!profile || profile.role !== 'guide') return null

  const full = await getSettlementFull(id, { audience: 'guide' })
  if (!full || full.guide_id !== profile.id) return null
  if (full.status !== 'pending_guide_confirmation' || !full.active_confirmation_id) return null

  const supabase = await createClient()

  const { data: confirmation } = await supabase
    .from(GUIDE_READ.settlement_confirmations)
    .select('snapshot_before_id, snapshot_after_id')
    .eq('id', full.active_confirmation_id)
    .eq('status', 'pending')
    .maybeSingle()

  if (!confirmation) return null

  const [{ data: beforeRow }, { data: afterRow }] = await Promise.all([
    supabase
      .from(GUIDE_READ.settlement_snapshots)
      .select('payload_json')
      .eq('id', confirmation.snapshot_before_id)
      .maybeSingle(),
    supabase
      .from(GUIDE_READ.settlement_snapshots)
      .select('payload_json')
      .eq('id', confirmation.snapshot_after_id)
      .maybeSingle(),
  ])

  const beforePayload = parseSnapshotPayload(beforeRow?.payload_json)
  const afterPayload = parseSnapshotPayload(afterRow?.payload_json)

  const { data: changes } = await supabase
    .from(GUIDE_READ.settlement_field_changes)
    .select('*')
    .eq('confirmation_id', full.active_confirmation_id)
    .order('created_at', { ascending: true })

  const visibleChanges = filterGuideConfirmationChanges((changes ?? []) as SettlementFieldChange[])

  return {
    settlement: sanitizeSettlementFullForGuide(full),
    changes: visibleChanges,
    companyDepositBefore: beforePayload?.calc_summary.company_deposit_usd ?? null,
    companyDepositAfter: afterPayload?.calc_summary.company_deposit_usd ?? null,
    guidePayoutBefore: beforePayload?.calc_summary.guide_payout_usd ?? null,
    guidePayoutAfter: afterPayload?.calc_summary.guide_payout_usd ?? null,
    adminNote: full.admin_note,
  }
}
