'use server'

import { revalidatePath } from 'next/cache'
import { isAdminTier, isMasterAdmin } from '@/lib/auth/permissions'
import {
  filterAdminToursByRegionScope,
  filterGuidesForTourAssignment,
  validateTourGuideAssignment,
} from '@/lib/guide/assignment'
import type { AdminRegionScope } from '@/lib/region/permissions'
import { filterMtourRegionBranches } from '@/lib/region/regions'
import { createClient } from '@/lib/supabase/server'
import type { Branch, Tour } from '@/types'

export interface GuideOption {
  id: string
  full_name: string
  email: string
  branch_id: string | null
  korean_name: string | null
  vietnamese_name: string | null
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
    .select('id, role, branch_id')
    .eq('id', user.id)
    .single()

  if (!data || !isAdminTier(data.role as import('@/types').UserRole)) return null
  return {
    id: data.id as string,
    role: data.role as import('@/types').UserRole,
    branch_id: data.branch_id as string | null,
    supabase,
  }
}

function adminRegionScope(ctx: NonNullable<Awaited<ReturnType<typeof requireAdminProfile>>>): AdminRegionScope {
  return { role: ctx.role, assignedRegionId: ctx.branch_id }
}

export async function getAdminTours(): Promise<TourWithGuide[]> {
  const ctx = await requireAdminProfile()
  if (!ctx) return []

  const { data } = await ctx.supabase
    .from('tours')
    .select('*, guide:profiles!guide_id(id, full_name, email)')
    .order('start_date', { ascending: false })
    .limit(200)

  const tours = (data ?? []) as TourWithGuide[]
  return filterAdminToursByRegionScope(tours, adminRegionScope(ctx))
}

export async function getBranches(): Promise<Branch[]> {
  const ctx = await requireAdminProfile()
  if (!ctx) return []

  const { data } = await ctx.supabase
    .from('branches')
    .select('id, name, code, created_at')
    .order('name')

  const regions = filterMtourRegionBranches((data ?? []) as Branch[])
  const scope = adminRegionScope(ctx)
  if (isMasterAdmin(scope.role)) return regions
  if (!scope.assignedRegionId) return regions
  return regions.filter((b) => b.id === scope.assignedRegionId)
}

export async function getGuideProfiles(): Promise<GuideOption[]> {
  const ctx = await requireAdminProfile()
  if (!ctx) return []

  const { data } = await ctx.supabase
    .from('profiles')
    .select('id, full_name, email, branch_id, korean_name, vietnamese_name')
    .eq('role', 'guide')
    .eq('is_active', true)
    .order('full_name')

  const guides = (data ?? []) as GuideOption[]
  return filterGuidesForTourAssignment(
    guides.map((g) => ({ ...g, role: 'guide', is_active: true })),
  )
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
  if (!input.branch_id) return { ok: false, error: '지역을 선택해주세요.' }

  const scope = adminRegionScope(ctx)

  const { data: guide } = await ctx.supabase
    .from('profiles')
    .select('id, role, branch_id, is_active')
    .eq('id', input.guide_id)
    .single()

  const assignmentError = validateTourGuideAssignment({
    adminScope: scope,
    tourBranchId: input.branch_id,
    guide: guide
      ? {
          id: guide.id as string,
          role: guide.role as string,
          is_active: !!guide.is_active,
          branch_id: guide.branch_id as string | null,
        }
      : null,
  })
  if (assignmentError) return { ok: false, error: assignmentError }

  const { data, error } = await ctx.supabase
    .from('tours')
    .insert({
      tour_code,
      agency_name,
      pattern,
      start_date: input.start_date,
      end_date: input.end_date,
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
