'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
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
  splitDbRowsForPersist,
  isMissingDbColumnError,
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
import type { SnapshotPayload } from '@/lib/settlement/snapshot'
import { externalReceivableDbFields } from '@/lib/settlement/external-receivable'
import {
  assertAdminReviewAction,
  assertAdminSaveSettlement,
  assertAdminSendForConfirmation,
  assertGuideConfirmAction,
} from '@/lib/settlement/status-guards'
import {
  canOperationalAdminReview,
  isAdminTier,
  settlementRequiresReconfirmAfterMasterAdminEdit,
} from '@/lib/auth/permissions'
import {
  ADMIN_SETTLEMENT_PAGE_SIZE,
  ADMIN_SETTLEMENT_SELECT,
  ACTION_NEEDED_STATUSES,
  escapeIlikePattern,
  sortActionNeededSettlements,
  type AdminSettlementListFilters,
  type AdminSettlementListItem,
  type AdminSettlementsPageResult,
} from '@/lib/admin/settlement-list'

// ── 인증 헬퍼 ─────────────────────────────────────────────────

async function getProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles').select('id,role,branch_id').eq('id', user.id).single()
  return data as { id: string; role: UserRole; branch_id: string | null } | null
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
  const { data, error } = await supabase
    .from('settlement_snapshots')
    .insert({
      settlement_id: params.settlementId,
      kind: params.kind,
      payload_json: params.payload,
      calc_summary_json: params.payload.calc_summary,
      created_by: params.createdBy,
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? '스냅샷 저장 실패' }
  return { ok: true, id: data.id as string }
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
) {
  await supabase.from('settlement_audit_events').insert({
    settlement_id: params.settlementId,
    actor_id: params.actorId,
    actor_role: params.actorRole,
    action: params.action,
    from_status: params.fromStatus,
    to_status: params.toStatus,
    note: params.note ?? null,
  })
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

/** 가이드의 미정산 투어 목록 (90일 이내) */
export async function getAvailableTours(): Promise<Tour[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10)

  const { data: tours } = await supabase
    .from('tours').select('*')
    .eq('guide_id', user.id)
    .gte('start_date', since)
    .order('start_date', { ascending: false })

  if (!tours?.length) return []

  const { data: used } = await supabase
    .from('settlements').select('tour_id').eq('guide_id', user.id)

  const usedSet = new Set((used ?? []).map((r: { tour_id: string }) => r.tour_id))
  return (tours as Tour[]).filter((t) => !usedSet.has(t.id))
}

// ── 정산서 조회 ────────────────────────────────────────────────

/** 가이드 본인 정산서 목록 */
export async function getMySettlements(): Promise<SettlementWithTour[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('settlements')
    .select('*, tour:tours(*)')
    .eq('guide_id', user.id)
    .order('created_at', { ascending: false })

  return (data ?? []).map((row) =>
    sanitizeSettlementForGuide(row as SettlementWithTour),
  ) as SettlementWithTour[]
}

/** Guide-facing settlement load — admin-only fields redacted. */
export async function getSettlementFullForGuide(id: string): Promise<SettlementFull | null> {
  const full = await getSettlementFull(id)
  if (!full) return null
  return sanitizeSettlementFullForGuide(full)
}

/** 정산서 상세 + 모든 항목 */
export async function getSettlementFull(id: string): Promise<SettlementFull | null> {
  const supabase = await createClient()

  const { data: s, error: settlementError } = await supabase
    .from('settlements').select('*, tour:tours(*)').eq('id', id).single()
  if (settlementError || !s) {
    if (settlementError) {
      console.error('[getSettlementFull] settlements:', settlementError.message)
    }
    return null
  }

  const fetchRows = async (
    table: string,
    orderColumn: string,
    ascending = true,
  ) => {
    const { data, error } = await supabase
      .from(table)
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
    hotels, meals, entrances, others, shoppings, options, companyExpenses, receipts,
  ] = await Promise.all([
    fetchRows('hotel_items', 'sort_order'),
    fetchRows('meal_items', 'sort_order'),
    fetchRows('entrance_items', 'sort_order'),
    fetchRows('other_expense_items', 'sort_order'),
    fetchRows('shopping_items', 'sort_order'),
    fetchRows('option_items', 'sort_order'),
    fetchRows('company_expense_items', 'sort_order'),
    fetchRows('receipts', 'created_at'),
  ])

  return {
    ...s,
    hotels,
    meals,
    entrances,
    others,
    shoppings,
    options,
    company_expenses: companyExpenses,
    receipts,
  } as SettlementFull
}

/** 관리자 정산서 목록 (페이지네이션 + 검색) */
export async function getAdminSettlements(
  filters?: AdminSettlementListFilters,
): Promise<AdminSettlementsPageResult> {
  const supabase = await createClient()
  const pageSize = filters?.pageSize ?? ADMIN_SETTLEMENT_PAGE_SIZE
  const page = Math.max(1, filters?.page ?? 1)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let q = supabase
    .from('settlements')
    .select(ADMIN_SETTLEMENT_SELECT, { count: 'exact' })
    .order('updated_at', { ascending: false })

  if (filters?.yearMonth) q = q.eq('year_month', filters.yearMonth)
  if (filters?.status) q = q.eq('status', filters.status)

  const search = filters?.search?.trim()
  if (search) {
    const pattern = `%${escapeIlikePattern(search)}%`
    const [toursRes, guidesRes] = await Promise.all([
      supabase
        .from('tours')
        .select('id')
        .or(`pattern.ilike.${pattern},tour_code.ilike.${pattern}`),
      supabase
        .from('profiles')
        .select('id')
        .or(
          `full_name.ilike.${pattern},email.ilike.${pattern},korean_name.ilike.${pattern},vietnamese_name.ilike.${pattern}`,
        ),
    ])

    const tourIds = (toursRes.data ?? []).map((t) => t.id as string)
    const guideIds = (guidesRes.data ?? []).map((g) => g.id as string)
    if (tourIds.length === 0 && guideIds.length === 0) {
      return { items: [], total: 0, page, pageSize, totalPages: 0 }
    }

    const orParts: string[] = []
    if (tourIds.length > 0) orParts.push(`tour_id.in.(${tourIds.join(',')})`)
    if (guideIds.length > 0) orParts.push(`guide_id.in.(${guideIds.join(',')})`)
    q = q.or(orParts.join(','))
  }

  const { data, count, error } = await q.range(from, to)
  if (error) {
    console.error('getAdminSettlements:', error.message)
    return { items: [], total: 0, page, pageSize, totalPages: 0 }
  }

  const total = count ?? 0
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize)

  return {
    items: (data ?? []) as unknown as AdminSettlementListItem[],
    total,
    page,
    pageSize,
    totalPages,
  }
}

/** 대시보드 처리 필요 큐 (우선순위 정렬) */
export async function getAdminActionQueue(limit = 10): Promise<AdminSettlementListItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('settlements')
    .select(ADMIN_SETTLEMENT_SELECT)
    .in('status', [...ACTION_NEEDED_STATUSES])
    .order('updated_at', { ascending: false })
    .limit(Math.max(limit * 5, 50))

  if (error) {
    console.error('getAdminActionQueue:', error.message)
    return []
  }

  return sortActionNeededSettlements((data ?? []) as unknown as AdminSettlementListItem[]).slice(0, limit)
}

/** 대시보드 월별 상태 집계 */
export async function getAdminDashboardStats(
  yearMonth: string,
): Promise<{ status: SettlementStatus; count: number }[]> {
  const supabase = await createClient()
  const statuses: SettlementStatus[] = [
    'draft',
    'submitted',
    'pending_guide_confirmation',
    'clarification_requested',
    'approved',
    'rejected',
    'edit_requested',
    'paid',
  ]

  const { data, error } = await supabase
    .from('settlements')
    .select('status')
    .eq('year_month', yearMonth)

  if (error) {
    console.error('getAdminDashboardStats:', error.message)
    return statuses.map((status) => ({ status, count: 0 }))
  }

  const rows = data ?? []
  return statuses.map((status) => ({
    status,
    count: rows.filter((r) => r.status === status).length,
  }))
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

  // 투어 년월
  const { data: tour } = await supabase
    .from('tours').select('start_date').eq('id', payload.tour_id).single()
  if (!tour) return { ok: false, error: '투어를 찾을 수 없습니다.' }

  const { id: _omitId, ...headerFields } = payload
  const base = {
    ...headerFields,
    guide_id: profile.id,
    branch_id: profile.branch_id,
    year_month: tour.start_date.slice(0, 7),
  }

  type WriteResult = { error: { message: string } | null; id?: string }

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

    const { data, error } = await supabase
      .from('settlements')
      .insert({ ...row, status: 'draft' })
      .select('id')
      .single()
    if (
      error &&
      (error.message.includes('option_receivable_usd') ||
        error.message.includes('tip_transfer_usd'))
    ) {
      const { option_receivable_usd: _or, tip_transfer_usd: _tt, ...legacyRow } = row
      const legacy = await supabase
        .from('settlements')
        .insert({ ...legacyRow, status: 'draft' })
        .select('id')
        .single()
      return { error: legacy.error, id: legacy.data?.id }
    }
    return { error, id: data?.id }
  }

  const writeResult = await writeSettlement(base)
  if (writeResult.error) return { ok: false, error: writeResult.error.message }
  const settlementId = payload.id ?? writeResult.id
  if (!settlementId) return { ok: false, error: '정산서 ID를 확인할 수 없습니다.' }

  revalidatePath('/guide/settlements')
  return { ok: true, id: settlementId }
}

// ── 제출 ──────────────────────────────────────────────────────

export async function submitSettlement(id: string): Promise<{ ok: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile) return { ok: false, error: '로그인이 필요합니다.' }
  if (profile.role !== 'guide') return { ok: false, error: '가이드 권한이 필요합니다.' }

  const supabase = await createClient()

  const { data: current } = await supabase
    .from('settlements')
    .select('id, status')
    .eq('id', id)
    .eq('guide_id', profile.id)
    .in('status', ['draft', 'rejected', 'edit_requested'])
    .maybeSingle()

  if (!current) return { ok: false, error: '제출할 수 없는 정산서입니다.' }

  const full = await getSettlementFull(id)
  if (!full) return { ok: false, error: '정산서를 찾을 수 없습니다.' }

  const payload = buildSnapshotPayload(full)
  const snap = await insertSnapshot(supabase, {
    settlementId: id,
    kind: 'guide_submit',
    payload,
    createdBy: profile.id,
  })
  if (!snap.ok) return { ok: false, error: snap.error }

  const now = new Date().toISOString()
  const fromStatus = current.status as SettlementStatus

  const { error } = await supabase
    .from('settlements')
    .update({
      status: 'submitted',
      submitted_at: now,
      guide_submit_snapshot_id: snap.id,
      active_confirmation_id: null,
      clarification_requested_at: null,
      clarification_message: null,
      calc_summary_json: payload.calc_summary,
    })
    .eq('id', id)
    .eq('guide_id', profile.id)
    .eq('status', fromStatus)

  if (error) return { ok: false, error: error.message }

  await insertAuditEvent(supabase, {
    settlementId: id,
    actorId: profile.id,
    actorRole: profile.role,
    action: 'guide_submit',
    fromStatus,
    toStatus: 'submitted',
  })

  revalidateSettlementPaths(id)
  return { ok: true }
}

// ── 라인 아이템 저장 ───────────────────────────────────────────

async function assertEditableSettlement(
  supabase: Awaited<ReturnType<typeof createClient>>,
  settlementId: string,
  guideId: string,
) {
  const { data } = await supabase
    .from('settlements')
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

  const itemTables: { table: string; rows: Record<string, unknown>[] }[] = [
    { table: 'hotel_items', rows: buildHotelDbRows(payload.hotels, settlementId) },
    { table: 'meal_items', rows: buildMealDbRows(payload.meals, settlementId) },
    { table: 'entrance_items', rows: buildEntranceDbRows(payload.entrances, settlementId) },
    { table: 'other_expense_items', rows: buildOtherDbRows(payload.others, settlementId) },
    { table: 'shopping_items', rows: buildShoppingDbRows(payload.shoppings, settlementId) },
    { table: 'option_items', rows: buildOptionDbRows(payload.options, settlementId, rate) },
  ]

  for (const { table, rows } of itemTables) {
    const { keepIds, toInsert, toUpdate } = splitDbRowsForPersist(rows)

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
  const profile = await getProfile()
  if (!profile) return { ok: false, error: '로그인이 필요합니다.' }
  if (profile.role !== 'guide') return { ok: false, error: '가이드 권한이 필요합니다.' }

  const supabase = await createClient()
  const editable = await assertEditableSettlement(supabase, settlementId, profile.id)
  if (!editable) return { ok: false, error: '수정할 수 없는 정산서입니다.' }

  const result = await persistSettlementLineItems(supabase, settlementId, payload)
  if (!result.ok) return result

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
  let payloadToSave = payload
  let preservedTourFeeUsd = 0
  if (payload.settlementId) {
    const existing = await getSettlementFull(payload.settlementId)
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
    return { ok: false, error: headerResult.error ?? '헤더 저장 실패' }
  }

  const itemsResult = await saveSettlementItems(headerResult.id, payloadToSave)
  if (!itemsResult.ok) {
    return { ok: false, id: headerResult.id, error: itemsResult.error }
  }

  const full = await getSettlementFull(headerResult.id)
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
  const profile = await getProfile()
  if (!profile) return { ok: false, error: '로그인이 필요합니다.' }
  if (!isAdminTier(profile.role)) {
    return { ok: false, error: '관리자 권한이 필요합니다.' }
  }

  if (!payload.settlementId) {
    return { ok: false, error: '정산서 ID가 필요합니다.' }
  }

  const existing = await getSettlementFull(payload.settlementId)
  if (!existing) return { ok: false, error: '정산서를 찾을 수 없습니다.' }

  const statusGuard = assertAdminSaveSettlement(profile.role, existing.status)
  if (!statusGuard.ok) return { ok: false, error: statusGuard.error }

  const sanitized = sanitizeAdminDraftPayload(payload, existing)
  const supabase = await createClient()
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

  if (headerErr) return { ok: false, error: headerErr.message }

  const itemsResult = await persistSettlementLineItems(supabase, payload.settlementId, sanitized)
  if (!itemsResult.ok) return { ok: false, error: itemsResult.error }

  const companyResult = await persistCompanyExpenseItems(
    supabase,
    payload.settlementId,
    sanitized.companyExpenses ?? [],
  )
  if (!companyResult.ok) return { ok: false, error: companyResult.error }

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

  const now = new Date().toISOString()

  if (params.action === 'approve') {
    if (!current.active_confirmation_id) {
      return { ok: false, error: '활성 확인 요청이 없습니다.' }
    }

    const full = await getSettlementFull(params.id)
    if (!full) return { ok: false, error: '정산서를 찾을 수 없습니다.' }

    const payload = buildSnapshotPayload(full)
    const snap = await insertSnapshot(supabase, {
      settlementId: params.id,
      kind: 'guide_confirmed',
      payload,
      createdBy: profile.id,
    })
    if (!snap.ok) return { ok: false, error: snap.error }

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

    const { error: updErr } = await supabase
      .from('settlements')
      .update({
        status: 'approved',
        guide_confirmed_at: now,
        guide_confirmed_by: profile.id,
        reviewed_at: now,
        reviewed_by: profile.id,
        reject_reason: null,
        admin_note: params.adminNote?.trim() || full.admin_note,
      })
      .eq('id', params.id)
      .eq('status', 'pending_guide_confirmation')

    if (updErr) return { ok: false, error: updErr.message }

    await insertAuditEvent(supabase, {
      settlementId: params.id,
      actorId: profile.id,
      actorRole: profile.role,
      action: 'status_change',
      fromStatus: 'pending_guide_confirmation',
      toStatus: 'approved',
      note: params.adminNote?.trim() || 'master_approve',
    })

    revalidateSettlementPaths(params.id)
    return { ok: true }
  }

  if (params.action === 'reopen') {
    const { error } = await supabase
      .from('settlements')
      .update({
        status: 'approved',
        paid_at: null,
        reviewed_by: profile.id,
        admin_note: params.adminNote?.trim() || null,
      })
      .eq('id', params.id)
      .eq('status', 'paid')

    if (error) return { ok: false, error: error.message }

    await insertAuditEvent(supabase, {
      settlementId: params.id,
      actorId: profile.id,
      actorRole: profile.role,
      action: 'status_change',
      fromStatus: 'paid',
      toStatus: 'approved',
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
      if (!params.rejectReason?.trim()) return { ok: false, error: '반려 사유를 입력해주세요.' }
      updates.status = 'rejected'
      updates.reviewed_at = now
      updates.reject_reason = params.rejectReason.trim()
      toStatus = 'rejected'
      auditAction = 'admin_reject'
      break
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

  const { error } = await supabase
    .from('settlements')
    .update(updates)
    .eq('id', params.id)
    .eq('status', fromStatus)

  if (error) return { ok: false, error: error.message }

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

  const afterSnap = await insertSnapshot(supabase, {
    settlementId: params.settlementId,
    kind: 'admin_pre_confirm',
    payload: afterPayload,
    createdBy: params.actorId,
  })
  if (!afterSnap.ok) return { ok: false, error: afterSnap.error }

  if (params.activeConfirmationId) {
    await supabase
      .from('settlement_confirmations')
      .update({ status: 'superseded' })
      .eq('id', params.activeConfirmationId)
      .eq('status', 'pending')
  }

  const now = new Date().toISOString()

  const { data: confirmation, error: confErr } = await supabase
    .from('settlement_confirmations')
    .insert({
      settlement_id: params.settlementId,
      snapshot_before_id: beforeSnapshotId,
      snapshot_after_id: afterSnap.id,
      status: 'pending',
      sent_by: params.actorId,
      sent_at: now,
      r85_before: beforePayload.calc_summary.guide_settlement_usd,
      r85_after: afterPayload.calc_summary.guide_settlement_usd,
      r87_before: beforePayload.calc_summary.company_grand_total_usd,
      r87_after: afterPayload.calc_summary.company_grand_total_usd,
      change_count: changes.length,
    })
    .select('id')
    .single()

  if (confErr || !confirmation) {
    return { ok: false, error: confErr?.message ?? '확인 요청 생성 실패' }
  }

  if (changes.length > 0) {
    const { error: fcErr } = await supabase.from('settlement_field_changes').insert(
      changes.map((c) => ({
        settlement_id: params.settlementId,
        confirmation_id: confirmation.id,
        field_path: c.field_path,
        excel_ref: c.excel_ref,
        label: c.label,
        owner: c.owner,
        old_value_json: c.old_value_json,
        new_value_json: c.new_value_json,
        old_display: c.old_display,
        new_display: c.new_display,
      })),
    )
    if (fcErr) return { ok: false, error: fcErr.message }
  }

  const settlementUpdate: Record<string, unknown> = {
    status: 'pending_guide_confirmation',
    sent_for_confirmation_at: now,
    sent_for_confirmation_by: params.actorId,
    active_confirmation_id: confirmation.id,
    admin_note: params.adminNote?.trim() || params.full.admin_note,
    reviewed_at: now,
    reviewed_by: params.actorId,
    calc_summary_json: afterPayload.calc_summary,
  }

  if (params.clearGuideConfirmation) {
    settlementUpdate.guide_confirmed_at = null
    settlementUpdate.guide_confirmed_by = null
  }

  const { error: updErr } = await supabase
    .from('settlements')
    .update(settlementUpdate)
    .eq('id', params.settlementId)
    .eq('status', params.fromStatus)

  if (updErr) return { ok: false, error: updErr.message }

  await insertAuditEvent(supabase, {
    settlementId: params.settlementId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: 'send_for_confirmation',
    fromStatus: params.fromStatus,
    toStatus: 'pending_guide_confirmation',
    note: params.clearGuideConfirmation
      ? 'master_admin_post_confirm_edit'
      : params.adminNote?.trim() || null,
  })

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

/** Guide accepts admin-reviewed settlement → approved. */
export async function guideConfirm(id: string): Promise<{ ok: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile) return { ok: false, error: '로그인이 필요합니다.' }
  if (profile.role !== 'guide') return { ok: false, error: '가이드 권한이 필요합니다.' }

  const supabase = await createClient()

  const { data: current } = await supabase
    .from('settlements')
    .select('id, status, guide_id, active_confirmation_id')
    .eq('id', id)
    .single()

  if (!current) return { ok: false, error: '정산서를 찾을 수 없습니다.' }

  const guard = assertGuideConfirmAction(
    { status: current.status as SettlementStatus, guide_id: current.guide_id as string },
    profile.id,
    'confirm',
  )
  if (!guard.ok) return { ok: false, error: guard.error }

  if (!current.active_confirmation_id) {
    return { ok: false, error: '활성 확인 요청이 없습니다.' }
  }

  const full = await getSettlementFull(id)
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

  const { error: updErr } = await supabase
    .from('settlements')
    .update({
      status: 'approved',
      guide_confirmed_at: now,
      guide_confirmed_by: profile.id,
      reviewed_at: now,
    })
    .eq('id', id)
    .eq('guide_id', profile.id)
    .eq('status', 'pending_guide_confirmation')

  if (updErr) return { ok: false, error: updErr.message }

  await insertAuditEvent(supabase, {
    settlementId: id,
    actorId: profile.id,
    actorRole: profile.role,
    action: 'guide_confirm',
    fromStatus: 'pending_guide_confirmation',
    toStatus: 'approved',
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
    .from('settlements')
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

  const full = await getSettlementFull(id)
  if (!full || full.guide_id !== profile.id) return null
  if (full.status !== 'pending_guide_confirmation' || !full.active_confirmation_id) return null

  const supabase = await createClient()

  const { data: confirmation } = await supabase
    .from('settlement_confirmations')
    .select('snapshot_before_id, snapshot_after_id')
    .eq('id', full.active_confirmation_id)
    .eq('status', 'pending')
    .maybeSingle()

  if (!confirmation) return null

  const [{ data: beforeRow }, { data: afterRow }] = await Promise.all([
    supabase
      .from('settlement_snapshots')
      .select('payload_json')
      .eq('id', confirmation.snapshot_before_id)
      .maybeSingle(),
    supabase
      .from('settlement_snapshots')
      .select('payload_json')
      .eq('id', confirmation.snapshot_after_id)
      .maybeSingle(),
  ])

  const beforePayload = parseSnapshotPayload(beforeRow?.payload_json)
  const afterPayload = parseSnapshotPayload(afterRow?.payload_json)

  const { data: changes } = await supabase
    .from('settlement_field_changes')
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
