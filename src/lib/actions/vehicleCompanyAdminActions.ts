'use server'

import { revalidatePath } from 'next/cache'
import { isAdminTier, isMasterAdmin, isVehicleCompany } from '@/lib/auth/permissions'
import { filterAdminToursByRegionScope } from '@/lib/guide/assignment'
import type { AdminRegionScope } from '@/lib/region/permissions'
import { assertAdminCanAccessSettlementBranch } from '@/lib/region/settlement-access'
import { createClient } from '@/lib/supabase/server'
import {
  deriveVehicleAssignmentStatus,
  VEHICLE_ASSIGNMENT_LOCKED_MESSAGE,
  type VehicleAssignmentStatus,
} from '@/lib/vehicle/assignment-status'
import type { VehicleTourReportStatus } from '@/lib/vehicle/report-status'
import type { UserRole } from '@/types'

export interface VehicleCompanyProfileItem {
  id: string
  full_name: string
  email: string
  korean_name: string | null
  branch_id: string | null
  is_active: boolean
}

export interface VehicleAssignmentTourItem {
  id: string
  tour_code: string
  start_date: string | null
  end_date: string | null
  branch_id: string
  guide_name: string | null
  vehicle_company_profile_id: string | null
  vehicle_company_name: string | null
  report_status: VehicleTourReportStatus
  assignment_status: VehicleAssignmentStatus
}

interface MutationResult {
  ok: boolean
  error?: string
}

type GuideRel = { full_name: string | null; korean_name: string | null } | null

interface AdminCtx {
  supabase: Awaited<ReturnType<typeof createClient>>
  id: string
  role: UserRole
  branch_id: string | null
}

async function getAdminCtx(): Promise<AdminCtx | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, branch_id')
    .eq('id', user.id)
    .single()
  if (!profile || !isAdminTier(profile.role as UserRole)) return null

  return {
    supabase,
    id: profile.id as string,
    role: profile.role as UserRole,
    branch_id: (profile.branch_id as string | null) ?? null,
  }
}

function scopeOf(ctx: AdminCtx): AdminRegionScope {
  return { role: ctx.role, assignedRegionId: ctx.branch_id }
}

function guideName(rel: GuideRel): string | null {
  if (!rel) return null
  return rel.korean_name || rel.full_name || null
}

function vehicleCompanyDisplayName(
  profile: Pick<VehicleCompanyProfileItem, 'korean_name' | 'full_name' | 'email'>,
): string {
  return profile.korean_name || profile.full_name || profile.email || '차량회사'
}

async function loadVehicleCompanyNamesById(
  ctx: AdminCtx,
  profileIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(profileIds.filter(Boolean))]
  if (unique.length === 0) return new Map()

  const { data } = await ctx.supabase
    .from('profiles')
    .select('id, full_name, email, korean_name')
    .in('id', unique)

  const map = new Map<string, string>()
  for (const row of data ?? []) {
    const p = row as Pick<VehicleCompanyProfileItem, 'id' | 'korean_name' | 'full_name' | 'email'>
    map.set(p.id, vehicleCompanyDisplayName(p))
  }
  return map
}

// ── Assignable vehicle company accounts (profiles) ──────────────────────────

/** Active vehicle_company-role profiles in admin scope (for assignment picker). */
export async function getAssignableVehicleCompanyProfiles(): Promise<VehicleCompanyProfileItem[]> {
  const ctx = await getAdminCtx()
  if (!ctx) return []

  const { data } = await ctx.supabase
    .from('profiles')
    .select('id, full_name, email, korean_name, branch_id, is_active')
    .eq('role', 'vehicle_company')
    .eq('is_active', true)
    .order('full_name')

  const rows = (data ?? []) as VehicleCompanyProfileItem[]
  if (isMasterAdmin(ctx.role)) return rows
  if (!ctx.branch_id) return rows
  return rows.filter((p) => p.branch_id === ctx.branch_id)
}

// ── Tour vehicle company assignment ─────────────────────────────────────────

export async function getAdminVehicleAssignmentTours(): Promise<VehicleAssignmentTourItem[]> {
  const ctx = await getAdminCtx()
  if (!ctx) return []

  const { data: tourRows } = await ctx.supabase
    .from('tours')
    .select(
      'id, tour_code, start_date, end_date, branch_id, vehicle_company_profile_id, assignment_status, ' +
      'guide:profiles!guide_id(full_name, korean_name)',
    )
    .eq('assignment_status', 'assigned')
    .order('start_date', { ascending: true })
    .order('tour_code', { ascending: true })
    .limit(200)

  const scoped = filterAdminToursByRegionScope(
    (tourRows ?? []) as unknown as { branch_id: string }[],
    scopeOf(ctx),
  ) as unknown as Array<Record<string, unknown>>
  if (scoped.length === 0) return []

  const tourIds = scoped.map((t) => t.id as string)
  const profileIds = scoped
    .map((t) => (t.vehicle_company_profile_id as string | null) ?? null)
    .filter((id): id is string => !!id)

  const [{ data: reportRows }, nameById] = await Promise.all([
    ctx.supabase
      .from('vehicle_route_reports')
      .select('tour_id, status')
      .in('tour_id', tourIds),
    loadVehicleCompanyNamesById(ctx, profileIds),
  ])

  const reportByTour = new Map<string, VehicleTourReportStatus>()
  for (const row of reportRows ?? []) {
    const r = row as { tour_id: string; status: VehicleTourReportStatus }
    reportByTour.set(r.tour_id, r.status)
  }

  return scoped.map((t) => {
    const profileId = (t.vehicle_company_profile_id as string | null) ?? null
    const reportStatus = reportByTour.get(t.id as string) ?? 'none'
    return {
      id: t.id as string,
      tour_code: (t.tour_code as string) ?? '',
      start_date: (t.start_date as string | null) ?? null,
      end_date: (t.end_date as string | null) ?? null,
      branch_id: t.branch_id as string,
      guide_name: guideName((t.guide as GuideRel) ?? null),
      vehicle_company_profile_id: profileId,
      vehicle_company_name: profileId ? nameById.get(profileId) ?? null : null,
      report_status: reportStatus,
      assignment_status: deriveVehicleAssignmentStatus(!!profileId, reportStatus),
    }
  })
}

async function reportExistsForTour(ctx: AdminCtx, tourId: string): Promise<boolean> {
  const { data } = await ctx.supabase
    .from('vehicle_route_reports')
    .select('id')
    .eq('tour_id', tourId)
    .maybeSingle()
  return !!data
}

export async function assignVehicleCompanyToTour(
  tourId: string,
  vehicleCompanyProfileId: string,
): Promise<MutationResult> {
  const ctx = await getAdminCtx()
  if (!ctx) return { ok: false, error: '관리자 권한이 필요합니다.' }
  if (!tourId || !vehicleCompanyProfileId) return { ok: false, error: '배정 정보를 확인해주세요.' }

  const { data: tour } = await ctx.supabase
    .from('tours')
    .select('id, branch_id')
    .eq('id', tourId)
    .maybeSingle()
  if (!tour) return { ok: false, error: '투어를 찾을 수 없습니다.' }

  const regionGuard = assertAdminCanAccessSettlementBranch(scopeOf(ctx), tour.branch_id as string)
  if (!regionGuard.ok) return { ok: false, error: regionGuard.error }

  if (await reportExistsForTour(ctx, tourId)) {
    return { ok: false, error: VEHICLE_ASSIGNMENT_LOCKED_MESSAGE }
  }

  const { data: profile } = await ctx.supabase
    .from('profiles')
    .select('id, role, branch_id, is_active')
    .eq('id', vehicleCompanyProfileId)
    .maybeSingle()
  if (!profile) return { ok: false, error: '차량회사 계정을 찾을 수 없습니다.' }
  if (!isVehicleCompany(profile.role as UserRole)) {
    return { ok: false, error: '차량회사 권한 계정만 배정할 수 있습니다.' }
  }
  if (!profile.is_active) return { ok: false, error: '비활성 차량회사 계정은 배정할 수 없습니다.' }

  if ((profile.branch_id as string | null) !== (tour.branch_id as string)) {
    return { ok: false, error: '차량회사와 투어의 지역이 일치해야 합니다.' }
  }

  const { error } = await ctx.supabase
    .from('tours')
    .update({ vehicle_company_profile_id: vehicleCompanyProfileId })
    .eq('id', tourId)
  if (error) return { ok: false, error: '차량회사를 배정할 수 없습니다.' }

  revalidatePath('/admin/vehicle-assignments')
  revalidatePath('/vehicle')
  return { ok: true }
}

export async function clearVehicleCompanyFromTour(tourId: string): Promise<MutationResult> {
  const ctx = await getAdminCtx()
  if (!ctx) return { ok: false, error: '관리자 권한이 필요합니다.' }
  if (!tourId) return { ok: false, error: '투어 정보를 확인해주세요.' }

  const { data: tour } = await ctx.supabase
    .from('tours')
    .select('id, branch_id')
    .eq('id', tourId)
    .maybeSingle()
  if (!tour) return { ok: false, error: '투어를 찾을 수 없습니다.' }

  const regionGuard = assertAdminCanAccessSettlementBranch(scopeOf(ctx), tour.branch_id as string)
  if (!regionGuard.ok) return { ok: false, error: regionGuard.error }

  if (await reportExistsForTour(ctx, tourId)) {
    return { ok: false, error: VEHICLE_ASSIGNMENT_LOCKED_MESSAGE }
  }

  const { error } = await ctx.supabase
    .from('tours')
    .update({ vehicle_company_profile_id: null })
    .eq('id', tourId)
  if (error) return { ok: false, error: '배정을 해제할 수 없습니다.' }

  revalidatePath('/admin/vehicle-assignments')
  revalidatePath('/vehicle')
  return { ok: true }
}

