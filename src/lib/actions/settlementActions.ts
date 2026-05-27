'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { SettlementWithTour, SettlementFull, Tour } from '@/types'

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

  const base = {
    ...payload,
    guide_id:   profile.id,
    branch_id:  profile.branch_id,
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
  redirect('/guide/settlements')
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
  const now = new Date().toISOString()

  const updates: Record<string, unknown> = {
    reviewed_by: profile.id,
    admin_note:  params.adminNote ?? null,
  }

  switch (params.action) {
    case 'approve':
      updates.status       = 'approved'
      updates.reviewed_at  = now
      updates.reject_reason = null
      break
    case 'reject':
      if (!params.rejectReason?.trim()) return { ok: false, error: '반려 사유를 입력해주세요.' }
      updates.status        = 'rejected'
      updates.reviewed_at   = now
      updates.reject_reason = params.rejectReason.trim()
      break
    case 'request_edit':
      updates.status             = 'edit_requested'
      updates.edit_requested_at  = now
      updates.edit_requested_by  = profile.id
      break
    case 'pay':
      updates.status  = 'paid'
      updates.paid_at = now
      break
  }

  const { error } = await supabase
    .from('settlements').update(updates).eq('id', params.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/settlements')
  revalidatePath(`/admin/settlements/${params.id}`)
  return { ok: true }
}
