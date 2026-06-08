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
  vehicleCompanyId: string
}

/**
 * Resolve the current vehicle-company user context. Returns null unless the
 * caller is a vehicle_company-role user linked to a vehicle company. RLS still
 * enforces ownership on every query/mutation below — this is app-layer gating.
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

  const { data: link } = await supabase
    .from('vehicle_company_users')
    .select('vehicle_company_id')
    .eq('profile_id', user.id)
    .maybeSingle()
  if (!link) return null

  return {
    supabase,
    profileId: user.id,
    vehicleCompanyId: link.vehicle_company_id as string,
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

/** Tours assigned to the caller's vehicle company, with report status. */
export async function getVehicleCompanyAssignedTours(): Promise<VehicleAssignedTour[]> {
  const ctx = await getVehicleCtx()
  if (!ctx) return []

  // RLS (tours_vehicle_company_select) only returns tours assigned to this
  // company; the explicit filter is defense-in-depth.
  const { data: tourRows } = await ctx.supabase
    .from('tours')
    .select(TOUR_SELECT_WITH_GUIDE)
    .eq('vehicle_company_id', ctx.vehicleCompanyId)
    .order('start_date', { ascending: true })
    .order('tour_code', { ascending: true })
    .limit(200)

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

  return tours.map((t) => {
    const report = reportByTour.get(t.id)
    return {
      ...t,
      report_id: report?.id ?? null,
      report_status: (report?.status ?? 'none') as VehicleTourReportStatus,
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
    .eq('vehicle_company_id', ctx.vehicleCompanyId)
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
    .eq('vehicle_company_id', ctx.vehicleCompanyId)
    .maybeSingle()
  return !!data
}

/**
 * Upsert the draft content for a tour. Inserts a new draft if none exists,
 * updates the existing draft otherwise. Submitted reports are rejected (locked).
 * Returns the report id on success.
 */
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
    event_code: payload.event_code,
    event_period_text: payload.event_period_text,
    pax_text: payload.pax_text,
    flight_info_text: payload.flight_info_text,
    vehicle_text: payload.vehicle_text,
    hotel_text: payload.hotel_text,
    guide_text: payload.guide_text,
    daily_routes: payload.daily_routes,
    special_notes: payload.special_notes,
    updated_at: new Date().toISOString(),
  }

  if (!existing) {
    const { data, error } = await ctx.supabase
      .from('vehicle_route_reports')
      .insert({
        tour_id: tourId,
        vehicle_company_id: ctx.vehicleCompanyId,
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

/** Save (create or update) the draft report for an assigned tour. */
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

/** Final-submit the report for an assigned tour. Locks it (status=submitted). */
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

  // Ensure the row exists as a draft with the latest content first…
  const draft = await upsertDraftContent(ctx, tourId, validation.payload)
  if (!draft.ok) return draft

  // …then flip draft → submitted. The DB submitted-lock trigger only allows this
  // because OLD.status is still 'draft'; any already-submitted row is rejected.
  const { data, error } = await ctx.supabase
    .from('vehicle_route_reports')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      submitted_by: ctx.profileId,
      updated_at: new Date().toISOString(),
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
