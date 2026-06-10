'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  assignVehicleCompanyToTour,
  clearVehicleCompanyFromTour,
  type VehicleAssignmentTourItem,
  type VehicleCompanyProfileItem,
} from '@/lib/actions/vehicleCompanyAdminActions'
import {
  canChangeVehicleAssignment,
  isVehicleAssignmentGuideCheckIssue,
  vehicleAssignmentAssignedBadgeLabel,
  vehicleAssignmentGuideCheckBadgeLabel,
  vehicleAssignmentReportBadgeLabel,
  type VehicleAssignmentAssignedBadge,
  type VehicleAssignmentGuideCheckBadge,
  type VehicleAssignmentReportBadge,
} from '@/lib/vehicle/assignment-status'
import {
  adminVehicleReportDetailHref,
  adminVehicleReportGuideCheckListLabel,
  adminVehicleReportIssueNotePreview,
} from '@/lib/vehicle/admin-vehicle-report'

interface Props {
  tours: VehicleAssignmentTourItem[]
  profiles: VehicleCompanyProfileItem[]
}

const ASSIGNED_BADGE: Record<VehicleAssignmentAssignedBadge, string> = {
  '미배정': 'bg-gray-100 text-gray-600',
  '배정완료': 'bg-blue-100 text-blue-700',
}

const REPORT_BADGE: Record<VehicleAssignmentReportBadge, string> = {
  '리포트 미작성': 'bg-gray-100 text-gray-600',
  '작성중': 'bg-amber-100 text-amber-700',
  '제출완료': 'bg-emerald-100 text-emerald-700',
}

const GUIDE_CHECK_BADGE: Record<VehicleAssignmentGuideCheckBadge, string> = {
  '가이드 미확인': 'bg-slate-100 text-slate-600',
  '이상없음': 'bg-emerald-100 text-emerald-700',
  '이상있음': 'bg-red-100 text-red-700',
}

function periodText(start: string | null, end: string | null): string {
  if (start && end) return `${start} ~ ${end}`
  return start || end || ''
}

function profileLabel(p: VehicleCompanyProfileItem): string {
  return p.korean_name || p.full_name || p.email || '차량회사'
}

export function VehicleAssignmentTable({ tours, profiles }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [draftSelection, setDraftSelection] = useState<Record<string, string>>({})

  const activeProfilesByBranch = useMemo(() => {
    const map = new Map<string, VehicleCompanyProfileItem[]>()
    for (const p of profiles) {
      if (!p.is_active || !p.branch_id) continue
      const list = map.get(p.branch_id) ?? []
      list.push(p)
      map.set(p.branch_id, list)
    }
    return map
  }, [profiles])

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, fallback: string) => {
    setError('')
    startTransition(async () => {
      const result = await fn()
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.error ?? fallback)
      }
    })
  }

  if (tours.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
        배정 가능한 투어가 없습니다.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      <ul className="space-y-3">
        {tours.map((tour) => {
          const locked = !canChangeVehicleAssignment(tour.report_status)
          const branchProfiles = activeProfilesByBranch.get(tour.branch_id) ?? []
          const selected = draftSelection[tour.id] ?? tour.vehicle_company_profile_id ?? ''

          const assignedLabel = vehicleAssignmentAssignedBadgeLabel(
            !!tour.vehicle_company_profile_id,
          )
          const reportLabel = vehicleAssignmentReportBadgeLabel(tour.report_status)
          const guideCheckLabel = vehicleAssignmentGuideCheckBadgeLabel(
            tour.report_status,
            tour.guide_check_status,
          )

          return (
            <li key={tour.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{tour.tour_code || '투어'}</p>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                    {periodText(tour.start_date, tour.end_date) && (
                      <span>{periodText(tour.start_date, tour.end_date)}</span>
                    )}
                    {tour.guide_name && <span>가이드 {tour.guide_name}</span>}
                    {tour.vehicle_company_name && <span>차량회사 {tour.vehicle_company_name}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${ASSIGNED_BADGE[assignedLabel]}`}
                  >
                    {assignedLabel}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${REPORT_BADGE[reportLabel]}`}
                  >
                    {reportLabel}
                  </span>
                  {guideCheckLabel && (
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${GUIDE_CHECK_BADGE[guideCheckLabel]}`}
                    >
                      {guideCheckLabel}
                    </span>
                  )}
                </div>
              </div>

              {tour.report_status === 'submitted' && (() => {
                const detailCheckLabel = adminVehicleReportGuideCheckListLabel(tour.report_status, {
                  check_status: tour.guide_check_status,
                  checked_at: tour.guide_check_checked_at,
                  issue_note: tour.guide_check_issue_note,
                })
                const issuePreview = adminVehicleReportIssueNotePreview(tour.guide_check_issue_note)
                const hasIssue = isVehicleAssignmentGuideCheckIssue(
                  tour.report_status,
                  tour.guide_check_status,
                )
                return (
                <div
                  className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                    hasIssue
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : 'border-emerald-100 bg-emerald-50 text-emerald-800'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">제출완료</span>
                    {detailCheckLabel && <span>· {detailCheckLabel}</span>}
                    {tour.guide_check_checked_at && (
                      <span className={hasIssue ? 'text-red-700' : 'text-emerald-700'}>
                        · {new Date(tour.guide_check_checked_at).toLocaleString('ko-KR')}
                      </span>
                    )}
                  </div>
                  {issuePreview && (
                    <p className={`mt-1 ${hasIssue ? 'text-red-700' : 'text-emerald-700'}`}>
                      메모: {issuePreview}
                    </p>
                  )}
                  <Link
                    href={adminVehicleReportDetailHref(tour.id)}
                    className={`mt-2 inline-flex rounded-lg border bg-white px-3 py-1.5 text-xs font-medium ${
                      hasIssue
                        ? 'border-red-200 text-red-700 hover:bg-red-100'
                        : 'border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    리포트 보기
                  </Link>
                </div>
                )
              })()}

              {locked ? (
                <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  이미 차량 리포트가 작성되어 배정을 변경할 수 없습니다. 배정회수를 통해 초기화해야 합니다.
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    className="min-h-10 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    value={selected}
                    disabled={pending}
                    onChange={(e) =>
                      setDraftSelection((prev) => ({ ...prev, [tour.id]: e.target.value }))
                    }
                  >
                    <option value="">차량회사 계정 선택</option>
                    {branchProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {profileLabel(p)}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pending || !selected || selected === tour.vehicle_company_profile_id}
                      onClick={() =>
                        run(
                          () => assignVehicleCompanyToTour(tour.id, selected),
                          '배정에 실패했습니다.',
                        )
                      }
                      className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                    >
                      배정
                    </button>
                    {tour.vehicle_company_profile_id && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(() => clearVehicleCompanyFromTour(tour.id), '해제에 실패했습니다.')
                        }
                        className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        해제
                      </button>
                    )}
                  </div>
                </div>
              )}

              {!locked && branchProfiles.length === 0 && (
                <p className="mt-2 text-xs text-amber-600">
                  이 지역에 활성화된 차량회사 계정이 없습니다.
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
