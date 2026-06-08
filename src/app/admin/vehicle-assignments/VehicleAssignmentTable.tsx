'use client'

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
  vehicleAssignmentStatusLabel,
  type VehicleAssignmentStatus,
} from '@/lib/vehicle/assignment-status'

interface Props {
  tours: VehicleAssignmentTourItem[]
  profiles: VehicleCompanyProfileItem[]
}

const STATUS_BADGE: Record<VehicleAssignmentStatus, string> = {
  unassigned: 'bg-gray-100 text-gray-600',
  assigned: 'bg-blue-100 text-blue-700',
  draft: 'bg-amber-100 text-amber-700',
  submitted: 'bg-emerald-100 text-emerald-700',
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
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_BADGE[tour.assignment_status]}`}
                >
                  {vehicleAssignmentStatusLabel(tour.assignment_status)}
                </span>
              </div>

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
