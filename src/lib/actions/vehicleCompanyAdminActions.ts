'use server'

import { revalidatePath } from 'next/cache'
import { isAdminTier, isMasterAdmin, isVehicleCompany } from '@/lib/auth/permissions'
import { filterAdminToursByRegionScope } from '@/lib/guide/assignment'
import { filterMtourRegionBranches } from '@/lib/region/regions'
import type { AdminRegionScope } from '@/lib/region/permissions'
import { assertAdminCanAccessSettlementBranch } from '@/lib/region/settlement-access'
import { createClient } from '@/lib/supabase/server'
import {
  canChangeVehicleAssignment,
  deriveVehicleAssignmentStatus,
  VEHICLE_ASSIGNMENT_LOCKED_MESSAGE,
  type VehicleAssignmentStatus,
} from '@/lib/vehicle/assignment-status'
import type { VehicleTourReportStatus } from '@/lib/vehicle/report-status'
import type { Branch, UserRole } from '@/types'

export interface VehicleCompanyAdminItem {
  id: string
  name: string
  branch_id: string
  is_active: boolean
  created_at: string
}

export interface VehicleCompanyProfileOption {
  id: string
  full_name: string
  email: string
  korean_name: string | null
  current_vehicle_company_id: string | null
}

export interface VehicleAssignmentTourItem {
  id: string
  tour_code: string
  start_date: string | null
  end_date: string | null
  branch_id: string
  guide_name: string | null
  vehicle_company_id: string | null
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

// ── Vehicle company management ──────────────────────────────────────────────

export async function getAdminVehicleCompanies(): Promise<VehicleCompanyAdminItem[]> {
  const ctx = await getAdminCtx()
  if (!ctx) return []

  const { data } = await ctx.supabase
    .from('vehicle_companies')
    .select('id, name, branch_id, is_active, created_at')
    .order('name', { ascending: true })

  const rows = (data ?? []) as VehicleCompanyAdminItem[]
  if (isMasterAdmin(ctx.role)) return rows
  if (!ctx.branch_id) return rows
  return rows.filter((c) => c.branch_id === ctx.branch_id)
}

export async function getAdminVehicleBranches(): Promise<Branch[]> {
  const ctx = await getAdminCtx()
  if (!ctx) return []

  const { data } = await ctx.supabase
    .from('branches')
    .select('id, name, code, created_at')
    .order('name')

  const regions = filterMtourRegionBranches((data ?? []) as Branch[])
  if (isMasterAdmin(ctx.role)) return regions
  if (!ctx.branch_id) return regions
  return regions.filter((b) => b.id === ctx.branch_id)
}

export async function createVehicleCompany(
  input: { name: string; branch_id: string },
): Promise<MutationResult> {
  const ctx = await getAdminCtx()
  if (!ctx) return { ok: false, error: '관리자 권한이 필요합니다.' }

  const name = (input.name ?? '').trim()
  if (!name) return { ok: false, error: '차량회사명을 입력해주세요.' }
  if (name.length > 200) return { ok: false, error: '차량회사명이 너무 깁니다.' }
  if (!input.branch_id) return { ok: false, error: '지역을 선택해주세요.' }

  const regionGuard = assertAdminCanAccessSettlementBranch(scopeOf(ctx), input.branch_id)
  if (!regionGuard.ok) return { ok: false, error: regionGuard.error }

  const { error } = await ctx.supabase
    .from('vehicle_companies')
    .insert({ name, branch_id: input.branch_id, is_active: true })
  if (error) return { ok: false, error: '차량회사를 생성할 수 없습니다.' }

  revalidatePath('/admin/vehicle-companies')
  revalidatePath('/admin/vehicle-assignments')
  return { ok: true }
}

export async function updateVehicleCompany(
  id: string,
  input: { name?: string; is_active?: boolean },
): Promise<MutationResult> {
  const ctx = await getAdminCtx()
  if (!ctx) return { ok: false, error: '관리자 권한이 필요합니다.' }

  const { data: company } = await ctx.supabase
    .from('vehicle_companies')
    .select('id, branch_id')
    .eq('id', id)
    .maybeSingle()
  if (!company) return { ok: false, error: '차량회사를 찾을 수 없습니다.' }

  const regionGuard = assertAdminCanAccessSettlementBranch(scopeOf(ctx), company.branch_id as string)
  if (!regionGuard.ok) return { ok: false, error: regionGuard.error }

  const patch: { name?: string; is_active?: boolean; updated_at: string } = {
    updated_at: new Date().toISOString(),
  }
  if (typeof input.name === 'string') {
    const name = input.name.trim()
    if (!name) return { ok: false, error: '차량회사명을 입력해주세요.' }
    if (name.length > 200) return { ok: false, error: '차량회사명이 너무 깁니다.' }
    patch.name = name
  }
  if (typeof input.is_active === 'boolean') patch.is_active = input.is_active

  const { error } = await ctx.supabase
    .from('vehicle_companies')
    .update(patch)
    .eq('id', id)
  if (error) return { ok: false, error: '차량회사를 수정할 수 없습니다.' }

  revalidatePath('/admin/vehicle-companies')
  revalidatePath('/admin/vehicle-assignments')
  return { ok: true }
}

export async function getAvailableVehicleCompanyProfiles(): Promise<VehicleCompanyProfileOption[]> {
  const ctx = await getAdminCtx()
  if (!ctx) return []

  const { data: profiles } = await ctx.supabase
    .from('profiles')
    .select('id, full_name, email, korean_name')
    .eq('role', 'vehicle_company')
    .order('full_name')

  const list = (profiles ?? []) as Omit<VehicleCompanyProfileOption, 'current_vehicle_company_id'>[]
  if (list.length === 0) return []

  const { data: links } = await ctx.supabase
    .from('vehicle_company_users')
    .select('profile_id, vehicle_company_id')
    .in('profile_id', list.map((p) => p.id))

  const linkByProfile = new Map<string, string>()
  for (const row of links ?? []) {
    const r = row as { profile_id: string; vehicle_company_id: string }
    linkByProfile.set(r.profile_id, r.vehicle_company_id)
  }

  return list.map((p) => ({
    ...p,
    current_vehicle_company_id: linkByProfile.get(p.id) ?? null,
  }))
}

/** Link one vehicle_company-role profile to one vehicle company (one per profile). */
export async function linkVehicleCompanyUser(
  profileId: string,
  vehicleCompanyId: string,
): Promise<MutationResult> {
  const ctx = await getAdminCtx()
  if (!ctx) return { ok: false, error: '관리자 권한이 필요합니다.' }
  if (!profileId || !vehicleCompanyId) return { ok: false, error: '연결 정보를 확인해주세요.' }

  // Target company must be within the admin's region scope.
  const { data: company } = await ctx.supabase
    .from('vehicle_companies')
    .select('id, branch_id')
    .eq('id', vehicleCompanyId)
    .maybeSingle()
  if (!company) return { ok: false, error: '차량회사를 찾을 수 없습니다.' }
  const regionGuard = assertAdminCanAccessSettlementBranch(scopeOf(ctx), company.branch_id as string)
  if (!regionGuard.ok) return { ok: false, error: regionGuard.error }

  // Only profiles with role vehicle_company may be linked.
  const { data: profile } = await ctx.supabase
    .from('profiles')
    .select('id, role')
    .eq('id', profileId)
    .maybeSingle()
  if (!profile || !isVehicleCompany(profile.role as UserRole)) {
    return { ok: false, error: '차량회사 권한 계정만 연결할 수 있습니다.' }
  }

  // One profile ↔ one vehicle company (PK on profile_id). Upsert keeps it single.
  const { error } = await ctx.supabase
    .from('vehicle_company_users')
    .upsert(
      { profile_id: profileId, vehicle_company_id: vehicleCompanyId },
      { onConflict: 'profile_id' },
    )
  if (error) return { ok: false, error: '계정을 연결할 수 없습니다.' }

  revalidatePath('/admin/vehicle-companies')
  return { ok: true }
}

// ── Tour vehicle company assignment ─────────────────────────────────────────

export async function getAdminVehicleAssignmentTours(): Promise<VehicleAssignmentTourItem[]> {
  const ctx = await getAdminCtx()
  if (!ctx) return []

  const { data: tourRows } = await ctx.supabase
    .from('tours')
    .select('id, tour_code, start_date, end_date, branch_id, vehicle_company_id, assignment_status, guide:profiles!guide_id(full_name, korean_name)')
    .eq('assignment_status', 'assigned')
    .order('start_date', { ascending: true })
    .order('tour_code', { ascending: true })
    .limit(200)

  const scoped = filterAdminToursByRegionScope(
    (tourRows ?? []) as { branch_id: string }[],
    scopeOf(ctx),
  ) as Array<Record<string, unknown>>
  if (scoped.length === 0) return []

  const tourIds = scoped.map((t) => t.id as string)

  const [{ data: reportRows }, companies] = await Promise.all([
    ctx.supabase
      .from('vehicle_route_reports')
      .select('tour_id, status')
      .in('tour_id', tourIds),
    getAdminVehicleCompanies(),
  ])

  const reportByTour = new Map<string, VehicleTourReportStatus>()
  for (const row of reportRows ?? []) {
    const r = row as { tour_id: string; status: VehicleTourReportStatus }
    reportByTour.set(r.tour_id, r.status)
  }
  const companyById = new Map(companies.map((c) => [c.id, c]))

  return scoped.map((t) => {
    const vehicleCompanyId = (t.vehicle_company_id as string | null) ?? null
    const reportStatus = reportByTour.get(t.id as string) ?? 'none'
    return {
      id: t.id as string,
      tour_code: (t.tour_code as string) ?? '',
      start_date: (t.start_date as string | null) ?? null,
      end_date: (t.end_date as string | null) ?? null,
      branch_id: t.branch_id as string,
      guide_name: guideName((t.guide as GuideRel) ?? null),
      vehicle_company_id: vehicleCompanyId,
      vehicle_company_name: vehicleCompanyId
        ? companyById.get(vehicleCompanyId)?.name ?? null
        : null,
      report_status: reportStatus,
      assignment_status: deriveVehicleAssignmentStatus(!!vehicleCompanyId, reportStatus),
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
  vehicleCompanyId: string,
): Promise<MutationResult> {
  const ctx = await getAdminCtx()
  if (!ctx) return { ok: false, error: '관리자 권한이 필요합니다.' }
  if (!tourId || !vehicleCompanyId) return { ok: false, error: '배정 정보를 확인해주세요.' }

  const { data: tour } = await ctx.supabase
    .from('tours')
    .select('id, branch_id')
    .eq('id', tourId)
    .maybeSingle()
  if (!tour) return { ok: false, error: '투어를 찾을 수 없습니다.' }

  const regionGuard = assertAdminCanAccessSettlementBranch(scopeOf(ctx), tour.branch_id as string)
  if (!regionGuard.ok) return { ok: false, error: regionGuard.error }

  // A report locks the assignment — only recall cleanup may reset it.
  if (await reportExistsForTour(ctx, tourId)) {
    return { ok: false, error: VEHICLE_ASSIGNMENT_LOCKED_MESSAGE }
  }

  const { data: company } = await ctx.supabase
    .from('vehicle_companies')
    .select('id, branch_id, is_active')
    .eq('id', vehicleCompanyId)
    .maybeSingle()
  if (!company) return { ok: false, error: '차량회사를 찾을 수 없습니다.' }
  if (!company.is_active) return { ok: false, error: '비활성 차량회사는 배정할 수 없습니다.' }

  // App-layer branch match (the DB trigger enforces this as defense-in-depth).
  if ((company.branch_id as string) !== (tour.branch_id as string)) {
    return { ok: false, error: '차량회사와 투어의 지역이 일치해야 합니다.' }
  }

  const { error } = await ctx.supabase
    .from('tours')
    .update({ vehicle_company_id: vehicleCompanyId })
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

  // Manual clear is allowed only while no report exists; otherwise reset must go
  // through the guide assignment-recall cleanup flow.
  if (await reportExistsForTour(ctx, tourId)) {
    return { ok: false, error: VEHICLE_ASSIGNMENT_LOCKED_MESSAGE }
  }

  const { error } = await ctx.supabase
    .from('tours')
    .update({ vehicle_company_id: null })
    .eq('id', tourId)
  if (error) return { ok: false, error: '배정을 해제할 수 없습니다.' }

  revalidatePath('/admin/vehicle-assignments')
  revalidatePath('/vehicle')
  return { ok: true }
}
