'use server'

import { revalidatePath } from 'next/cache'
import { isGuide } from '@/lib/auth/permissions'
import { createClient } from '@/lib/supabase/server'
import { normalizeVehicleReportPayload, type VehicleReportPayload } from '@/lib/vehicle/report-validation'
import {
  validateGuideCheckForSubmit,
  type GuideCheckStatus,
} from '@/lib/vehicle/guide-check'
import { resolveGuideVehicleReportDateRange } from '@/lib/vehicle/guide-vehicle-report-list'
import type { UserRole } from '@/types'

// Operational-only view. NEVER includes settlement/payout/money fields.
export interface GuideVehicleTourInfo {
  id: string
  tour_code: string
  pattern: string | null
  start_date: string | null
  end_date: string | null
  pax_count: number | null
  guide_name: string | null
}

export interface GuideVehicleReportListItem {
  tour_id: string
  report_id: string
  tour_code: string
  pattern: string | null
  start_date: string | null
  end_date: string | null
  /** true → 가이드 확인, false → 가이드 미확인 (list-level only). */
  checked: boolean
}

export interface GuideVehicleCheckRecord {
  check_status: GuideCheckStatus
  issue_note: string
  checked_at: string | null
}

export interface GuideVehicleReportDetail {
  tour: GuideVehicleTourInfo
  report: VehicleReportPayload & { id: string }
  check: GuideVehicleCheckRecord | null
}

interface MutationResult {
  ok: boolean
  error?: string
}

type GuideRel = { full_name: string | null; korean_name: string | null } | null

// Operational report columns only — no settlement/financial fields exist on
// vehicle_route_reports, but we still select an explicit operational set.
const REPORT_SELECT =
  'id, tour_id, status, event_code, event_period_text, pax_text, flight_info_text, ' +
  'vehicle_text, hotel_text, guide_text, daily_routes, special_notes, ' +
  'tour:tours!tour_id(id, tour_code, pattern, start_date, end_date, pax_count, guide_id, ' +
  'guide:profiles!guide_id(full_name, korean_name))'

function guideName(rel: GuideRel): string | null {
  if (!rel) return null
  return rel.korean_name || rel.full_name || null
}

function toTourInfo(row: Record<string, unknown> | null | undefined): GuideVehicleTourInfo {
  const r = (row ?? {}) as Record<string, unknown>
  return {
    id: (r.id as string) ?? '',
    tour_code: (r.tour_code as string) ?? '',
    pattern: (r.pattern as string | null) ?? null,
    start_date: (r.start_date as string | null) ?? null,
    end_date: (r.end_date as string | null) ?? null,
    pax_count: (r.pax_count as number | null) ?? null,
    guide_name: guideName((r.guide as GuideRel) ?? null),
  }
}

interface GuideCtx {
  supabase: Awaited<ReturnType<typeof createClient>>
  guideId: string
}

/**
 * Resolve the current guide context. Returns null unless the caller is a
 * guide-role user. RLS still enforces ownership on every query/mutation below
 * (guide may only read SUBMITTED reports for their own assigned tours, and may
 * INSERT a check once); this is app-layer gating in front of that.
 */
async function getGuideCtx(): Promise<GuideCtx | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!profile || !isGuide(profile.role as UserRole)) return null

  return { supabase, guideId: user.id }
}

/**
 * Submitted vehicle reports for tours assigned to the current guide, with the
 * guide's check status. Draft reports are never returned (RLS guide_select
 * requires status='submitted'; the explicit filter is defense-in-depth).
 */
export async function getGuideVehicleReports(options?: {
  period?: string
}): Promise<GuideVehicleReportListItem[]> {
  const ctx = await getGuideCtx()
  if (!ctx) return []

  const range = resolveGuideVehicleReportDateRange({ period: options?.period })

  const { data: tourRows } = await ctx.supabase
    .from('tours')
    .select('id')
    .eq('guide_id', ctx.guideId)
    .gte('start_date', range.from)
    .lte('start_date', range.to)

  const eligibleTourIds = (tourRows ?? []).map((t) => t.id as string)
  if (eligibleTourIds.length === 0) return []

  const { data: reportRows } = await ctx.supabase
    .from('vehicle_route_reports')
    .select(REPORT_SELECT)
    .eq('status', 'submitted')
    .in('tour_id', eligibleTourIds)

  const reports = (reportRows ?? []) as unknown as Array<Record<string, unknown>>
  if (reports.length === 0) return []

  const reportIds = reports.map((r) => r.id as string)
  const { data: checkRows } = await ctx.supabase
    .from('vehicle_report_checks')
    .select('report_id')
    .eq('guide_id', ctx.guideId)
    .in('report_id', reportIds)

  const checkedReportIds = new Set<string>()
  for (const row of checkRows ?? []) {
    checkedReportIds.add((row as { report_id: string }).report_id)
  }

  const items = reports.map((r) => {
    const tour = toTourInfo(r.tour as Record<string, unknown>)
    return {
      tour_id: r.tour_id as string,
      report_id: r.id as string,
      tour_code: tour.tour_code,
      pattern: tour.pattern,
      start_date: tour.start_date,
      end_date: tour.end_date,
      checked: checkedReportIds.has(r.id as string),
    }
  })

  // Unchecked first, then by start date for stable ordering.
  items.sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1
    return (a.start_date ?? '').localeCompare(b.start_date ?? '')
  })
  return items
}

/** A single submitted report for an assigned tour + the guide's check (if any). */
export async function getGuideVehicleReportDetail(
  tourId: string,
): Promise<GuideVehicleReportDetail | null> {
  const ctx = await getGuideCtx()
  if (!ctx) return null

  const { data: reportRow } = await ctx.supabase
    .from('vehicle_route_reports')
    .select(REPORT_SELECT)
    .eq('tour_id', tourId)
    .eq('status', 'submitted')
    .maybeSingle()
  if (!reportRow) return null

  const row = reportRow as unknown as Record<string, unknown>
  const reportId = row.id as string

  const { data: checkRow } = await ctx.supabase
    .from('vehicle_report_checks')
    .select('check_status, issue_note, checked_at')
    .eq('report_id', reportId)
    .eq('guide_id', ctx.guideId)
    .maybeSingle()

  const normalized = normalizeVehicleReportPayload(row)

  return {
    tour: toTourInfo(row.tour as Record<string, unknown>),
    report: { ...normalized, id: reportId },
    check: checkRow
      ? {
          check_status: (checkRow.check_status as GuideCheckStatus) ?? 'no_issue',
          issue_note: (checkRow.issue_note as string | null) ?? '',
          checked_at: (checkRow.checked_at as string | null) ?? null,
        }
      : null,
  }
}

/**
 * Submit the guide's one-time check for a submitted report. Insert-once: there
 * is no update path. If a check already exists, returns a friendly message.
 */
export async function submitGuideVehicleReportCheck(
  tourId: string,
  input: unknown,
): Promise<MutationResult> {
  const ctx = await getGuideCtx()
  if (!ctx) return { ok: false, error: '가이드 권한이 필요합니다.' }

  const validation = validateGuideCheckForSubmit(input)
  if (!validation.ok) return { ok: false, error: validation.error }

  // Resolve the submitted report for this tour. RLS guarantees it is submitted
  // and assigned to this guide; otherwise no row is returned.
  const { data: reportRow } = await ctx.supabase
    .from('vehicle_route_reports')
    .select('id')
    .eq('tour_id', tourId)
    .eq('status', 'submitted')
    .maybeSingle()
  if (!reportRow) {
    return { ok: false, error: '확인할 수 있는 제출된 리포트가 없습니다.' }
  }
  const reportId = reportRow.id as string

  // Insert-once guard at the app layer (DB also enforces via UNIQUE(report_id,
  // guide_id) and the absence of any UPDATE/DELETE policy/grant).
  const { data: existing } = await ctx.supabase
    .from('vehicle_report_checks')
    .select('id')
    .eq('report_id', reportId)
    .eq('guide_id', ctx.guideId)
    .maybeSingle()
  if (existing) {
    return { ok: false, error: '이미 확인을 완료한 리포트입니다.' }
  }

  const { error } = await ctx.supabase
    .from('vehicle_report_checks')
    .insert({
      report_id: reportId,
      tour_id: tourId,
      guide_id: ctx.guideId,
      check_status: validation.payload.check_status,
      issue_note: validation.payload.issue_note || null,
    })

  if (error) {
    // 23505 = unique violation → a check already exists (race / double submit).
    if ((error as { code?: string }).code === '23505') {
      return { ok: false, error: '이미 확인을 완료한 리포트입니다.' }
    }
    return { ok: false, error: '확인을 저장할 수 없습니다. 잠시 후 다시 시도해주세요.' }
  }

  revalidatePath('/guide/vehicle-reports')
  revalidatePath(`/guide/vehicle-reports/${tourId}`)
  return { ok: true }
}
