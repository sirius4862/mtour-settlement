'use server'

import { revalidatePath } from 'next/cache'
import { isVehicleCompany } from '@/lib/auth/permissions'
import { createClient } from '@/lib/supabase/server'
import {
  isVehicleReportLocked,
  normalizeVehicleReportPayload,
  validateVehicleReportForSubmit,
  type VehicleReportPayload,
  type VehicleReportStatus,
} from '@/lib/vehicle/report-validation'
import {
  ADMIN_DATE_RANGE_LIST_LIMIT,
  ADMIN_DATE_RANGE_LIST_LIMIT_ALL,
  parseAdminDateRangeSearchParams,
  type AdminDateRangeFilter,
} from '@/lib/admin/date-range-filter'
import type { GuideCheckStatus } from '@/lib/vehicle/guide-check'
import type { VehicleTourReportStatus } from '@/lib/vehicle/report-status'
import type { UserRole } from '@/types'

// Operational, non-financial view of a tour for the vehicle company. NEVER
// includes settlement/payout/money fields (those live on `settlements`, which
// this module never queries).
export interface VehicleTourInfo {
  id: string
  tour_code: string
  pattern: string | null
  start_date: string | null
  end_date: string | null
  pax_count: number | null
  guide_name: string | null
}

export interface VehicleAssignedTour extends VehicleTourInfo {
  report_id: string | null
  report_status: VehicleTourReportStatus
  guide_check_status: GuideCheckStatus | null
  guide_check_issue_note: string | null
}

export interface VehicleReportRecord extends VehicleReportPayload {
  id: string
  tour_id: string
  status: VehicleReportStatus
  submitted_at: string | null
}

export interface VehicleReportForTour {
  tour: VehicleTourInfo
  report: VehicleReportRecord | null
}

type GuideRel = { full_name: string | null; korean_name: string | null } | null

const TOUR_SELECT = 'id, tour_code, pattern, start_date, end_date, pax_count, guide_id'
const TOUR_SELECT_WITH_GUIDE = `${TOUR_SELECT}, guide:profiles!guide_id(full_name, korean_name)`

function guideName(rel: GuideRel): string | null {
  if (!rel) return null
  return rel.korean_name || rel.full_name || null
}

interface VehicleCtx {
  supabase: Awaited<ReturnType<typeof createClient>>
  profileId: string
}

/**
 * Resolve the current vehicle-company user context. Returns null unless the
 * caller has role vehicle_company. RLS enforces ownership on every query below.
 */
async function getVehicleCtx(): Promise<VehicleCtx | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!profile || !isVehicleCompany(profile.role as UserRole)) return null

  return {
    supabase,
    profileId: user.id,
  }
}

function toTourInfo(row: Record<string, unknown>): VehicleTourInfo {
  return {
    id: row.id as string,
    tour_code: (row.tour_code as string) ?? '',
    pattern: (row.pattern as string | null) ?? null,
    start_date: (row.start_date as string | null) ?? null,
    end_date: (row.end_date as string | null) ?? null,
    pax_count: (row.pax_count as number | null) ?? null,
    guide_name: guideName((row.guide as GuideRel) ?? null),
  }
}

function toReportRecord(row: Record<string, unknown>): VehicleReportRecord {
  const normalized = normalizeVehicleReportPayload(row)
  return {
    ...normalized,
    id: row.id as string,
    tour_id: row.tour_id as string,
    status: (row.status as VehicleReportStatus) ?? 'draft',
    submitted_at: (row.submitted_at as string | null) ?? null,
  }
}

/** Tours assigned to the caller's vehicle company profile, with report + guide-check status. */
export async function getVehicleCompanyAssignedTours(
  dateFilter?: AdminDateRangeFilter,
): Promise<VehicleAssignedTour[]> {
  const ctx = await getVehicleCtx()
  if (!ctx) return []

  const filter = dateFilter ?? parseAdminDateRangeSearchParams(undefined)

  let tourQuery = ctx.supabase
    .from('tours')
    .select(TOUR_SELECT_WITH_GUIDE)
    .eq('vehicle_company_profile_id', ctx.profileId)

  if (filter.range !== 'all') {
    if (filter.from) tourQuery = tourQuery.gte('start_date', filter.from)
    if (filter.to) tourQuery = tourQuery.lte('start_date', filter.to)
  }

  const listLimit =
    filter.range === 'all' ? ADMIN_DATE_RANGE_LIST_LIMIT_ALL : ADMIN_DATE_RANGE_LIST_LIMIT

  const { data: tourRows } = await tourQuery
    .order('start_date', { ascending: false })
    .order('tour_code', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(listLimit)

  const tours = (tourRows ?? []).map((r) => toTourInfo(r as Record<string, unknown>))
  if (tours.length === 0) return []

  const { data: reportRows } = await ctx.supabase
    .from('vehicle_route_reports')
    .select('id, tour_id, status')
    .in('tour_id', tours.map((t) => t.id))

  const reportByTour = new Map<string, { id: string; status: VehicleReportStatus }>()
  for (const row of reportRows ?? []) {
    const r = row as { id: string; tour_id: string; status: VehicleReportStatus }
    reportByTour.set(r.tour_id, { id: r.id, status: r.status })
  }

  const submittedReportIds = [...reportByTour.values()]
    .filter((r) => r.status === 'submitted')
    .map((r) => r.id)

  const checkByReportId = new Map<string, { check_status: GuideCheckStatus; issue_note: string | null }>()
  if (submittedReportIds.length > 0) {
    const { data: checkRows } = await ctx.supabase
      .from('vehicle_report_checks')
      .select('report_id, check_status, issue_note')
      .in('report_id', submittedReportIds)

    for (const row of checkRows ?? []) {
      const c = row as {
        report_id: string
        check_status: GuideCheckStatus
        issue_note: string | null
      }
      checkByReportId.set(c.report_id, {
        check_status: c.check_status,
        issue_note: c.issue_note,
      })
    }
  }

  return tours.map((t) => {
    const report = reportByTour.get(t.id)
    const reportStatus = (report?.status ?? 'none') as VehicleTourReportStatus
    const check = report?.id ? checkByReportId.get(report.id) ?? null : null
    return {
      ...t,
      report_id: report?.id ?? null,
      report_status: reportStatus,
      guide_check_status: check?.check_status ?? null,
      guide_check_issue_note: check?.issue_note ?? null,
    }
  })
}

/** Tour + its (own) vehicle report. Returns null if not assigned to caller. */
export async function getVehicleReportForTour(
  tourId: string,
): Promise<VehicleReportForTour | null> {
  const ctx = await getVehicleCtx()
  if (!ctx) return null

  const { data: tourRow } = await ctx.supabase
    .from('tours')
    .select(TOUR_SELECT_WITH_GUIDE)
    .eq('id', tourId)
    .eq('vehicle_company_profile_id', ctx.profileId)
    .maybeSingle()
  if (!tourRow) return null

  const { data: reportRow } = await ctx.supabase
    .from('vehicle_route_reports')
    .select('id, tour_id, status, submitted_at, event_code, event_period_text, pax_text, flight_info_text, vehicle_text, hotel_text, guide_text, daily_routes, special_notes')
    .eq('tour_id', tourId)
    .maybeSingle()

  return {
    tour: toTourInfo(tourRow as Record<string, unknown>),
    report: reportRow ? toReportRecord(reportRow as Record<string, unknown>) : null,
  }
}

interface MutationResult {
  ok: boolean
  error?: string
}

async function assertAssignedTour(ctx: VehicleCtx, tourId: string): Promise<boolean> {
  const { data } = await ctx.supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('vehicle_company_profile_id', ctx.profileId)
    .maybeSingle()
  return !!data
}

function reportContentColumns(payload: VehicleReportPayload) {
  return {
    event_code: payload.event_code,
    event_period_text: payload.event_period_text,
    pax_text: payload.pax_text,
    flight_info_text: payload.flight_info_text,
    vehicle_text: payload.vehicle_text,
    hotel_text: payload.hotel_text,
    guide_text: payload.guide_text,
    daily_routes: payload.daily_routes,
    special_notes: payload.special_notes,
  }
}

async function upsertDraftContent(
  ctx: VehicleCtx,
  tourId: string,
  payload: VehicleReportPayload,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data: existing } = await ctx.supabase
    .from('vehicle_route_reports')
    .select('id, status')
    .eq('tour_id', tourId)
    .maybeSingle()

  const content = {
    ...reportContentColumns(payload),
    updated_at: new Date().toISOString(),
  }

  if (!existing) {
    const { data, error } = await ctx.supabase
      .from('vehicle_route_reports')
      .insert({
        tour_id: tourId,
        vehicle_company_profile_id: ctx.profileId,
        status: 'draft',
        ...content,
      })
      .select('id')
      .single()
    if (error || !data) {
      return { ok: false, error: '리포트를 저장할 수 없습니다. 잠시 후 다시 시도해주세요.' }
    }
    return { ok: true, id: data.id as string }
  }

  if (isVehicleReportLocked(existing.status as VehicleReportStatus)) {
    return { ok: false, error: '이미 제출된 리포트는 수정할 수 없습니다.' }
  }

  const { data, error } = await ctx.supabase
    .from('vehicle_route_reports')
    .update(content)
    .eq('id', existing.id as string)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle()
  if (error || !data) {
    return { ok: false, error: '리포트를 저장할 수 없습니다. 잠시 후 다시 시도해주세요.' }
  }
  return { ok: true, id: data.id as string }
}

export async function saveVehicleReportDraft(
  tourId: string,
  input: unknown,
): Promise<MutationResult> {
  const ctx = await getVehicleCtx()
  if (!ctx) return { ok: false, error: '차량회사 권한이 필요합니다.' }
  if (!(await assertAssignedTour(ctx, tourId))) {
    return { ok: false, error: '배정된 투어가 아닙니다.' }
  }

  const payload = normalizeVehicleReportPayload(input)
  const result = await upsertDraftContent(ctx, tourId, payload)
  if (!result.ok) return result

  revalidatePath('/vehicle')
  revalidatePath(`/vehicle/reports/${tourId}`)
  return { ok: true }
}

export async function submitVehicleReport(
  tourId: string,
  input: unknown,
): Promise<MutationResult> {
  const ctx = await getVehicleCtx()
  if (!ctx) return { ok: false, error: '차량회사 권한이 필요합니다.' }
  if (!(await assertAssignedTour(ctx, tourId))) {
    return { ok: false, error: '배정된 투어가 아닙니다.' }
  }

  const validation = validateVehicleReportForSubmit(input)
  if (!validation.ok) return { ok: false, error: validation.error }

  const draft = await upsertDraftContent(ctx, tourId, validation.payload)
  if (!draft.ok) return draft

  const now = new Date().toISOString()
  const { data, error } = await ctx.supabase
    .from('vehicle_route_reports')
    .update({
      ...reportContentColumns(validation.payload),
      status: 'submitted',
      submitted_at: now,
      submitted_by: ctx.profileId,
      updated_at: now,
    })
    .eq('id', draft.id)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle()

  if (error || !data) {
    return { ok: false, error: '리포트를 제출할 수 없습니다. 이미 제출되었는지 확인해주세요.' }
  }

  revalidatePath('/vehicle')
  revalidatePath(`/vehicle/reports/${tourId}`)
  return { ok: true }
}
