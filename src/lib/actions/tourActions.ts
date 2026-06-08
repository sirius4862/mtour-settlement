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
import { sortAdminToursForList } from '@/lib/admin/tour-list'
import { validateCreateTourTextLengths } from '@/lib/tour/create-tour-validation'
import { assertCanRecallTourAssignment } from '@/lib/tour/assignment-recall'
import { assertAdminCanAccessSettlementBranch } from '@/lib/region/settlement-access'
import { createClient } from '@/lib/supabase/server'
import type { Branch, SettlementStatus, Tour, TourAssignmentStatus } from '@/types'

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

export interface AdminTourListItem extends TourWithGuide {
  /** Settlement created by the assigned guide for this tour, if any. */
  settlement: { id: string; status: SettlementStatus; guide_confirmed_at: string | null } | null
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

export async function getAdminTours(): Promise<AdminTourListItem[]> {
  const ctx = await requireAdminProfile()
  if (!ctx) return []

  const { data } = await ctx.supabase
    .from('tours')
    .select('*, guide:profiles!guide_id(id, full_name, email)')
    .order('start_date', { ascending: true })
    .order('tour_code', { ascending: true })
    .order('id', { ascending: true })
    .limit(200)

  const tours = filterAdminToursByRegionScope(
    (data ?? []) as TourWithGuide[],
    adminRegionScope(ctx),
  )
  const sorted = sortAdminToursForList(tours)

  const tourIds = sorted.map((t) => t.id)
  const settlementByTourId = new Map<
    string,
    { id: string; status: SettlementStatus; guide_confirmed_at: string | null }
  >()
  if (tourIds.length > 0) {
    const { data: settlements } = await ctx.supabase
      .from('settlements')
      .select('id, tour_id, guide_id, status, guide_confirmed_at')
      .in('tour_id', tourIds)

    for (const row of settlements ?? []) {
      const r = row as {
        id: string
        tour_id: string
        guide_id: string
        status: SettlementStatus
        guide_confirmed_at: string | null
      }
      // Show the assigned guide's settlement for this tour.
      const tour = sorted.find((t) => t.id === r.tour_id)
      if (tour && r.guide_id === tour.guide_id && !settlementByTourId.has(r.tour_id)) {
        settlementByTourId.set(r.tour_id, {
          id: r.id,
          status: r.status,
          guide_confirmed_at: r.guide_confirmed_at,
        })
      }
    }
  }

  return sorted.map((t) => ({
    ...t,
    settlement: settlementByTourId.get(t.id) ?? null,
  }))
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
  const textLengthValidation = validateCreateTourTextLengths({ tour_code, agency_name, pattern })
  if (!textLengthValidation.ok) return textLengthValidation
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

/**
 * 배정회수 — recall a wrong guide assignment. Status-only / assignment-only change:
 * the tour is marked `recalled` and any draft/submitted settlement moves to
 * `recalled`. Never deletes records, never touches monetary fields, paid_at,
 * guide_confirmed_at/by, or receipts; guide_id is preserved for traceability.
 * Guide change is NOT supported and is never performed here.
 */
export async function recallTourAssignment(
  tourId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireAdminProfile()
  if (!ctx) return { ok: false, error: '관리자 권한이 필요합니다.' }

  const { data: tour } = await ctx.supabase
    .from('tours')
    .select('id, branch_id, guide_id, assignment_status')
    .eq('id', tourId)
    .maybeSingle()
  if (!tour) return { ok: false, error: '투어를 찾을 수 없습니다.' }

  const regionGuard = assertAdminCanAccessSettlementBranch(
    adminRegionScope(ctx),
    tour.branch_id as string,
  )
  if (!regionGuard.ok) return { ok: false, error: regionGuard.error }

  const { data: settlement } = await ctx.supabase
    .from('settlements')
    .select('id, status, guide_confirmed_at')
    .eq('tour_id', tourId)
    .eq('guide_id', tour.guide_id as string)
    .maybeSingle()

  const guard = assertCanRecallTourAssignment({
    role: ctx.role,
    assignmentStatus: (tour.assignment_status ?? 'assigned') as TourAssignmentStatus,
    settlementStatus: (settlement?.status ?? null) as SettlementStatus | null,
    guideConfirmedAt: (settlement?.guide_confirmed_at ?? null) as string | null,
  })
  if (!guard.ok) return { ok: false, error: guard.error }

  const now = new Date().toISOString()

  // Recall the tour first so the guide immediately loses visibility — tours RLS and
  // the guide settlement read view both key off tours.assignment_status = 'recalled'.
  const { error: tourError } = await ctx.supabase
    .from('tours')
    .update({ assignment_status: 'recalled', recalled_at: now, recalled_by: ctx.id })
    .eq('id', tourId)
    .eq('assignment_status', 'assigned')
  if (tourError) {
    return { ok: false, error: '배정을 회수할 수 없습니다. 잠시 후 다시 시도해주세요.' }
  }

  // Status-only transition for an existing draft/submitted settlement. The workflow
  // trigger authorizes only draft/submitted → recalled for admin tier.
  if (settlement) {
    const fromStatus = settlement.status as SettlementStatus
    const { error: settlementError } = await ctx.supabase
      .from('settlements')
      .update({ status: 'recalled' })
      .eq('id', settlement.id as string)
      .eq('status', fromStatus)
    if (settlementError) {
      return {
        ok: false,
        error: '배정은 회수되었으나 정산서 상태 갱신에 실패했습니다. 다시 시도해주세요.',
      }
    }
  }

  // 배정회수 vehicle cleanup — clear tours.vehicle_company_profile_id and delete the now
  // invalid vehicle report (+ checks via ON DELETE CASCADE) together with the
  // recall. Runs through an admin-gated SECURITY DEFINER RPC so there is no
  // standing DELETE grant on vehicle_route_reports. This does NOT touch any
  // settlement calculation, payout, status flow, paid-lock, or guide confirmation.
  const { error: vehicleCleanupError } = await ctx.supabase.rpc(
    'recall_tour_vehicle_cleanup',
    { p_tour_id: tourId },
  )
  if (vehicleCleanupError) {
    return {
      ok: false,
      error: '배정은 회수되었으나 차량 리포트 정리에 실패했습니다. 다시 시도해주세요.',
    }
  }

  revalidatePath('/admin/tours')
  revalidatePath('/admin/vehicle-assignments')
  revalidatePath('/vehicle')
  revalidatePath('/guide')
  revalidatePath('/guide/settlements')
  revalidatePath('/guide/settlements/new')

  return { ok: true }
}
