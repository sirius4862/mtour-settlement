'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { SettlementWithTour, SettlementFull, Tour } from '@/types'
import {
  buildEntranceDbRows,
  buildHotelDbRows,
  buildMealDbRows,
  buildOptionDbRows,
  buildOtherDbRows,
  buildShoppingDbRows,
  type SettlementDraftPayload,
  type SettlementSyncPayload,
} from '@/lib/settlement/mappers'
import { assertAdminReviewAction } from '@/lib/settlement/status-guards'

// ── 인증 헬퍼 ─────────────────────────────────────────────────

async function getProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles').select('id,role,branch_id').eq('id', user.id).single()
  return data as { id: string; role: string; branch_id: string | null } | null
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

  return (data ?? []) as SettlementWithTour[]
}

/** 정산서 상세 + 모든 항목 */
export async function getSettlementFull(id: string): Promise<SettlementFull | null> {
  const supabase = await createClient()

  const { data: s } = await supabase
    .from('settlements').select('*, tour:tours(*)').eq('id', id).single()
  if (!s) return null

  const [
    { data: hotels }, { data: meals }, { data: entrances },
    { data: others }, { data: shoppings }, { data: options },
    { data: receipts },
  ] = await Promise.all([
    supabase.from('hotel_items').select('*').eq('settlement_id', id).order('sort_order'),
    supabase.from('meal_items').select('*').eq('settlement_id', id).order('sort_order'),
    supabase.from('entrance_items').select('*').eq('settlement_id', id).order('sort_order'),
    supabase.from('other_expense_items').select('*').eq('settlement_id', id).order('sort_order'),
    supabase.from('shopping_items').select('*').eq('settlement_id', id).order('sort_order'),
    supabase.from('option_items').select('*').eq('settlement_id', id).order('sort_order'),
    supabase.from('receipts').select('*').eq('settlement_id', id).order('created_at'),
  ])

  return {
    ...s,
    hotels:    hotels    ?? [],
    meals:     meals     ?? [],
    entrances: entrances ?? [],
    others:    others    ?? [],
    shoppings: shoppings ?? [],
    options:   options   ?? [],
    receipts:  receipts  ?? [],
  } as SettlementFull
}

/** 관리자 전체 정산서 목록 */
export async function getAdminSettlements(filters?: {
  yearMonth?: string; status?: string
}) {
  const supabase = await createClient()

  let q = supabase
    .from('settlements')
    .select('*, tour:tours(*), guide:profiles!guide_id(id,full_name,email)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (filters?.yearMonth) q = q.eq('year_month', filters.yearMonth)
  if (filters?.status)    q = q.eq('status', filters.status)

  const { data } = await q
  return data ?? []
}

// ── 정산서 생성 / 임시저장 ─────────────────────────────────────

export async function upsertSettlement(payload: {
  id?: string
  tour_id: string
  exchange_rate: number
  advance_vnd: number
  tour_fee_usd: number
  charming_other_usd: number
  tip_received_usd: number
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

  if (payload.id) {
    // 기존 draft 업데이트
    const { error } = await supabase
      .from('settlements').update(base)
      .eq('id', payload.id).eq('guide_id', profile.id)
      .in('status', ['draft', 'rejected', 'edit_requested'])
    if (error) return { ok: false, error: error.message }
    revalidatePath('/guide/settlements')
    return { ok: true, id: payload.id }
  } else {
    const { data, error } = await supabase
      .from('settlements')
      .insert({ ...base, status: 'draft' })
      .select('id').single()
    if (error) return { ok: false, error: error.message }
    revalidatePath('/guide/settlements')
    return { ok: true, id: data.id }
  }
}

// ── 제출 ──────────────────────────────────────────────────────

export async function submitSettlement(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다.' }

  const { error } = await supabase
    .from('settlements')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', id).eq('guide_id', user.id)
    .in('status', ['draft', 'rejected', 'edit_requested'])

  if (error) return { ok: false, error: error.message }

  revalidatePath('/guide/settlements')
  revalidatePath(`/guide/settlements/${id}`)
  revalidatePath('/admin/settlements')
  revalidatePath(`/admin/settlements/${id}`)
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
    const keepIds = rows.map((r) => r.id).filter(Boolean) as string[]

    let deleteQuery = supabase.from(table).delete().eq('settlement_id', settlementId)
    if (keepIds.length > 0) {
      deleteQuery = deleteQuery.not('id', 'in', `(${keepIds.map((id) => `"${id}"`).join(',')})`)
    }
    const { error: delErr } = await deleteQuery
    if (delErr) return { ok: false, error: delErr.message }

    if (rows.length > 0) {
      const { error: upsertErr } = await supabase.from(table).upsert(rows, { onConflict: 'id' })
      if (upsertErr) return { ok: false, error: upsertErr.message }
    }
  }

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
  const headerResult = await upsertSettlement({
    id: payload.settlementId ?? undefined,
    tour_id: payload.tourId,
    exchange_rate: payload.exchange_rate,
    advance_vnd: payload.header.advance_vnd,
    tour_fee_usd: payload.header.tour_fee_usd,
    charming_other_usd: payload.header.charming_other_usd,
    tip_received_usd: payload.header.tip_received_usd,
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
  })

  if (!headerResult.ok || !headerResult.id) {
    return { ok: false, error: headerResult.error ?? '헤더 저장 실패' }
  }

  const itemsResult = await saveSettlementItems(headerResult.id, payload)
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
    sync: {
      status: full.status,
      receipts: full.receipts,
      hotels: full.hotels,
      meals: full.meals,
      entrances: full.entrances,
      others: full.others,
      shoppings: full.shoppings,
      options: full.options,
    },
  }
}

// ── 관리자 액션 ───────────────────────────────────────────────

export async function reviewSettlement(params: {
  id: string
  action: 'approve' | 'reject' | 'request_edit' | 'pay'
  rejectReason?: string
  adminNote?: string
}): Promise<{ ok: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile || !['admin', 'staff'].includes(profile.role)) {
    return { ok: false, error: '관리자 권한이 필요합니다.' }
  }

  const supabase = await createClient()

  const { data: current } = await supabase
    .from('settlements')
    .select('id, status, guide_confirmed_at, guide_submit_snapshot_id')
    .eq('id', params.id)
    .single()

  if (!current) return { ok: false, error: '정산서를 찾을 수 없습니다.' }

  const guard = assertAdminReviewAction(
    {
      status: current.status as import('@/types').SettlementStatus,
      guide_confirmed_at: current.guide_confirmed_at,
      guide_submit_snapshot_id: current.guide_submit_snapshot_id,
    },
    params.action,
  )
  if (!guard.ok) return { ok: false, error: guard.error }

  const now = new Date().toISOString()

  const updates: Record<string, unknown> = {
    reviewed_by: profile.id,
    admin_note: params.adminNote ?? null,
  }

  switch (params.action) {
    case 'approve':
      updates.status = 'approved'
      updates.reviewed_at = now
      updates.reject_reason = null
      break
    case 'reject':
      if (!params.rejectReason?.trim()) return { ok: false, error: '반려 사유를 입력해주세요.' }
      updates.status = 'rejected'
      updates.reviewed_at = now
      updates.reject_reason = params.rejectReason.trim()
      break
    case 'request_edit':
      updates.status = 'edit_requested'
      updates.edit_requested_at = now
      updates.edit_requested_by = profile.id
      break
    case 'pay':
      updates.status = 'paid'
      updates.paid_at = now
      break
  }

  const { error } = await supabase
    .from('settlements')
    .update(updates)
    .eq('id', params.id)
    .eq('status', current.status)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/settlements')
  revalidatePath(`/admin/settlements/${params.id}`)
  revalidatePath('/guide/settlements')
  revalidatePath(`/guide/settlements/${params.id}`)
  return { ok: true }
}
