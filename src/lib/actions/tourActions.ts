'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Branch, Tour } from '@/types'
import { calcTourNights } from '@/lib/tour/nights'

export interface GuideOption {
  id: string
  full_name: string
  email: string
  branch_id: string | null
}

export interface TourWithGuide extends Tour {
  guide: { id: string; full_name: string; email: string } | null
}

export interface CreateTourInput {
  tour_code: string
  agency_name: string
  pattern: string
  start_date: string
  end_date: string
  pax_count: number
  vehicle_type: string
  tc_name: string
  guide_id: string
  branch_id: string
}

async function requireAdminProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!data || !['admin', 'staff'].includes(data.role)) return null
  return { id: data.id as string, supabase }
}

export async function getAdminTours(): Promise<TourWithGuide[]> {
  const ctx = await requireAdminProfile()
  if (!ctx) return []

  const { data } = await ctx.supabase
    .from('tours')
    .select('*, guide:profiles!guide_id(id, full_name, email)')
    .order('start_date', { ascending: false })
    .limit(200)

  return (data ?? []) as TourWithGuide[]
}

export async function getBranches(): Promise<Branch[]> {
  const ctx = await requireAdminProfile()
  if (!ctx) return []

  const { data } = await ctx.supabase
    .from('branches')
    .select('id, name, code, created_at')
    .order('name')

  return (data ?? []) as Branch[]
}

export async function getGuideProfiles(): Promise<GuideOption[]> {
  const ctx = await requireAdminProfile()
  if (!ctx) return []

  const { data } = await ctx.supabase
    .from('profiles')
    .select('id, full_name, email, branch_id')
    .eq('role', 'guide')
    .eq('is_active', true)
    .order('full_name')

  return (data ?? []) as GuideOption[]
}

export async function createTour(
  input: CreateTourInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const ctx = await requireAdminProfile()
  if (!ctx) return { ok: false, error: '관리자 권한이 필요합니다.' }

  const tour_code = input.tour_code.trim()
  const agency_name = input.agency_name.trim()
  const pattern = input.pattern.trim()
  const vehicle_type = input.vehicle_type.trim()
  const tc_name = input.tc_name.trim()

  if (!tour_code) return { ok: false, error: '투어코드를 입력해주세요.' }
  if (!agency_name) return { ok: false, error: '여행사명을 입력해주세요.' }
  if (!pattern) return { ok: false, error: '패턴을 입력해주세요.' }
  if (!input.start_date || !input.end_date) return { ok: false, error: '기간을 입력해주세요.' }
  if (input.end_date < input.start_date) {
    return { ok: false, error: '종료일은 시작일 이후여야 합니다.' }
  }
  if (!Number.isFinite(input.pax_count) || input.pax_count < 1) {
    return { ok: false, error: '인원은 1명 이상이어야 합니다.' }
  }
  if (!vehicle_type) return { ok: false, error: '차량 종류를 입력해주세요.' }
  if (!tc_name) return { ok: false, error: 'TC 이름을 입력해주세요.' }
  if (!input.guide_id) return { ok: false, error: '가이드를 선택해주세요.' }
  if (!input.branch_id) return { ok: false, error: '지사를 선택해주세요.' }

  const { data: guide } = await ctx.supabase
    .from('profiles')
    .select('id, role, branch_id, is_active')
    .eq('id', input.guide_id)
    .single()

  if (!guide || guide.role !== 'guide' || !guide.is_active) {
    return { ok: false, error: '유효한 가이드를 선택해주세요.' }
  }
  if (!guide.branch_id) {
    return { ok: false, error: '선택한 가이드에 지사(branch)가 설정되어 있지 않습니다.' }
  }
  if (guide.branch_id !== input.branch_id) {
    return { ok: false, error: '가이드 지사와 선택한 지사가 일치하지 않습니다.' }
  }

  const nights = calcTourNights(input.start_date, input.end_date)

  const { data, error } = await ctx.supabase
    .from('tours')
    .insert({
      tour_code,
      agency_name,
      pattern,
      start_date: input.start_date,
      end_date: input.end_date,
      nights,
      pax_count: Math.round(input.pax_count),
      vehicle_type,
      guide_id: input.guide_id,
      tc_name,
      branch_id: input.branch_id,
      created_by: ctx.id,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: '이미 사용 중인 투어코드입니다.' }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/admin/tours')
  revalidatePath('/guide/settlements/new')
  revalidatePath('/guide/settlements')

  return { ok: true, id: data.id }
}
