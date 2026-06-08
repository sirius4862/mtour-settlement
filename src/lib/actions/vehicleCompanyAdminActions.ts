'use server'

import { revalidatePath } from 'next/cache'
import { isAdminTier, isMasterAdmin, isVehicleCompany } from '@/lib/auth/permissions'
import type { AdminRegionScope } from '@/lib/region/permissions'
import { assertAdminCanAccessSettlementBranch } from '@/lib/region/settlement-access'
import { createClient } from '@/lib/supabase/server'
import {
  buildVehicleAssignmentTourListItems,
  filterVehicleAssignmentToursByScope,
  parseVehicleAssignmentSearchParams,
  VEHICLE_ASSIGNMENT_LIST_LIMIT,
  VEHICLE_ASSIGNMENT_LIST_LIMIT_ALL,
  type VehicleAssignmentDateFilter,
  type VehicleAssignmentTourRow,
} from '@/lib/vehicle/admin-assignment-list'
import {
  VEHICLE_ASSIGNMENT_LOCKED_MESSAGE,
  type VehicleAssignmentStatus,
} from '@/lib/vehicle/assignment-status'
import type { GuideCheckStatus } from '@/lib/vehicle/guide-check'
import { normalizeVehicleReportPayload } from '@/lib/vehicle/report-validation'
import type { VehicleTourReportStatus } from '@/lib/vehicle/report-status'
import type {
  AdminVehicleReportContent,
  AdminVehicleReportDetailView,
  AdminVehicleReportGuideCheckDetail,
  AdminVehicleReportGuideCheckSummary,
  AdminVehicleReportTourInfo,
} from '@/lib/vehicle/admin-vehicle-report'
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
  guide_check_status: GuideCheckStatus | null
  guide_check_checked_at: string | null
  guide_check_issue_note: string | null
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

async function loadProfileDisplayNamesById(
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

async function loadVehicleCompanyNamesById(
  ctx: AdminCtx,
  profileIds: string[],
): Promise<Map<string, string>> {
  return loadProfileDisplayNamesById(ctx, profileIds)
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

export async function getAdminVehicleAssignmentTours(
  dateFilter?: VehicleAssignmentDateFilter,
): Promise<VehicleAssignmentTourItem[]> {
  const ctx = await getAdminCtx()
  if (!ctx) return []

  const filter = dateFilter ?? parseVehicleAssignmentSearchParams(undefined)

  // Tours-first list: no join/filter on vehicle_route_reports. Branch + date filters
  // run in the DB before limit so scoped admins never lose recent rows to global noise.
  let tourQuery = ctx.supabase
    .from('tours')
    .select(
      'id, tour_code, start_date, end_date, branch_id, vehicle_company_profile_id, assignment_status, ' +
      'guide:profiles!guide_id(full_name, korean_name)',
    )
    .eq('assignment_status', 'assigned')

  if (!isMasterAdmin(ctx.role) && ctx.branch_id) {
    tourQuery = tourQuery.eq('branch_id', ctx.branch_id)
  }

  if (filter.range !== 'all') {
    if (filter.from) tourQuery = tourQuery.gte('start_date', filter.from)
    if (filter.to) tourQuery = tourQuery.lte('start_date', filter.to)
  }

  const listLimit =
    filter.range === 'all' ? VEHICLE_ASSIGNMENT_LIST_LIMIT_ALL : VEHICLE_ASSIGNMENT_LIST_LIMIT

  const { data: tourRows } = await tourQuery
    .order('start_date', { ascending: false })
    .order('tour_code', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(listLimit)

  const scoped = filterVehicleAssignmentToursByScope(
    (tourRows ?? []) as unknown as { branch_id: string }[],
    scopeOf(ctx),
  ) as unknown as Array<Record<string, unknown>>
  if (scoped.length === 0) return []

  const rows: VehicleAssignmentTourRow[] = scoped.map((t) => ({
    id: t.id as string,
    tour_code: (t.tour_code as string) ?? '',
    start_date: (t.start_date as string | null) ?? null,
    end_date: (t.end_date as string | null) ?? null,
    branch_id: t.branch_id as string,
    vehicle_company_profile_id: (t.vehicle_company_profile_id as string | null) ?? null,
    guide_name: guideName((t.guide as GuideRel) ?? null),
  }))

  const tourIds = rows.map((t) => t.id)
  const profileIds = rows
    .map((t) => t.vehicle_company_profile_id)
    .filter((id): id is string => !!id)

  const [{ data: reportRows }, nameById] = await Promise.all([
    tourIds.length > 0
      ? ctx.supabase
          .from('vehicle_route_reports')
          .select('id, tour_id, status')
          .in('tour_id', tourIds)
      : Promise.resolve({ data: [] as { id: string; tour_id: string; status: VehicleTourReportStatus }[] }),
    loadVehicleCompanyNamesById(ctx, profileIds),
  ])

  const reportByTour = new Map<string, { id: string; status: VehicleTourReportStatus }>()
  for (const row of reportRows ?? []) {
    const r = row as { id: string; tour_id: string; status: VehicleTourReportStatus }
    reportByTour.set(r.tour_id, { id: r.id, status: r.status })
  }

  const submittedReportIds = [...reportByTour.values()]
    .filter((r) => r.status === 'submitted')
    .map((r) => r.id)

  const checkByReportId = new Map<string, AdminVehicleReportGuideCheckSummary>()
  if (submittedReportIds.length > 0) {
    const { data: checkRows } = await ctx.supabase
      .from('vehicle_report_checks')
      .select('report_id, check_status, issue_note, checked_at')
      .in('report_id', submittedReportIds)

    for (const row of checkRows ?? []) {
      const c = row as {
        report_id: string
        check_status: GuideCheckStatus
        issue_note: string | null
        checked_at: string | null
      }
      checkByReportId.set(c.report_id, {
        check_status: c.check_status,
        checked_at: c.checked_at,
        issue_note: c.issue_note,
      })
    }
  }

  const items = buildVehicleAssignmentTourListItems(
    rows,
    new Map([...reportByTour.entries()].map(([tourId, r]) => [tourId, r.status])),
    nameById,
  )

  return items.map((item) => {
    const report = reportByTour.get(item.id)
    const check =
      report?.status === 'submitted' && report.id
        ? checkByReportId.get(report.id) ?? null
        : null
    return {
      ...item,
      guide_check_status: check?.check_status ?? null,
      guide_check_checked_at: check?.checked_at ?? null,
      guide_check_issue_note: check?.issue_note ?? null,
    }
  })
}

/** Submitted vehicle report + guide check for admin read-only detail. Branch-scoped. */
export async function getAdminVehicleReportDetail(
  tourId: string,
): Promise<AdminVehicleReportDetailView | null> {
  const ctx = await getAdminCtx()
  if (!ctx || !tourId) return null

  const { data: tourRow } = await ctx.supabase
    .from('tours')
    .select(
      'id, tour_code, start_date, end_date, branch_id, vehicle_company_profile_id, ' +
      'guide:profiles!guide_id(full_name, korean_name)',
    )
    .eq('id', tourId)
    .maybeSingle()
  if (!tourRow) return null
  const tourData = tourRow as unknown as Record<string, unknown>

  const branchId = tourData.branch_id as string
  const regionGuard = assertAdminCanAccessSettlementBranch(scopeOf(ctx), branchId)
  if (!regionGuard.ok) return null

  const { data: reportRow } = await ctx.supabase
    .from('vehicle_route_reports')
    .select(
      'id, tour_id, status, submitted_at, submitted_by, event_code, event_period_text, pax_text, ' +
      'flight_info_text, vehicle_text, hotel_text, guide_text, daily_routes, special_notes',
    )
    .eq('tour_id', tourId)
    .eq('status', 'submitted')
    .maybeSingle()
  if (!reportRow) return null
  const reportData = reportRow as unknown as Record<string, unknown>

  const reportId = reportData.id as string
  const vehicleProfileId = (tourData.vehicle_company_profile_id as string | null) ?? null

  const [vehicleNameById, submitterNameById, checkRow] = await Promise.all([
    vehicleProfileId
      ? loadVehicleCompanyNamesById(ctx, [vehicleProfileId])
      : Promise.resolve(new Map<string, string>()),
    reportData.submitted_by
      ? loadProfileDisplayNamesById(ctx, [reportData.submitted_by as string])
      : Promise.resolve(new Map<string, string>()),
    ctx.supabase
      .from('vehicle_report_checks')
      .select(
        'check_status, issue_note, checked_at, guide_id, guide:profiles!guide_id(full_name, korean_name)',
      )
      .eq('report_id', reportId)
      .maybeSingle(),
  ])

  const normalized = normalizeVehicleReportPayload(reportData)
  const report: AdminVehicleReportContent = {
    ...normalized,
    id: reportId,
    submitted_at: (reportData.submitted_at as string | null) ?? null,
    submitted_by_name: reportData.submitted_by
      ? submitterNameById.get(reportData.submitted_by as string) ?? null
      : null,
  }

  const tour: AdminVehicleReportTourInfo = {
    id: tourData.id as string,
    tour_code: (tourData.tour_code as string) ?? '',
    start_date: (tourData.start_date as string | null) ?? null,
    end_date: (tourData.end_date as string | null) ?? null,
    branch_id: branchId,
    guide_name: guideName((tourData.guide as GuideRel) ?? null),
    vehicle_company_name: vehicleProfileId
      ? vehicleNameById.get(vehicleProfileId) ?? null
      : null,
  }

  let guide_check: AdminVehicleReportGuideCheckDetail | null = null
  if (checkRow.data) {
    const c = checkRow.data as Record<string, unknown>
    guide_check = {
      check_status: (c.check_status as GuideCheckStatus) ?? 'no_issue',
      issue_note: (c.issue_note as string | null) ?? null,
      checked_at: (c.checked_at as string | null) ?? null,
      guide_name: guideName((c.guide as GuideRel) ?? null),
    }
  }

  return { tour, report, guide_check }
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

