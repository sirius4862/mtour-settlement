'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { VehicleAssignmentDateFilter } from '@/lib/vehicle/admin-assignment-list'
import {
  buildVehicleAssignmentListHref,
  vehicleAssignmentQuickRangeUrls,
  VEHICLE_ASSIGNMENT_ALL_RANGE_WARNING,
  VEHICLE_ASSIGNMENT_DEFAULT_RANGE_NOTICE,
} from '@/lib/vehicle/admin-assignment-list'

interface Props {
  filter: VehicleAssignmentDateFilter
  showDefaultMonthNotice: boolean
  showAllWarning: boolean
}

const QUICK_LABELS = {
  fromToday: '오늘 이후',
  forwardWeek: '최근 7일',
  currentMonth: '이번 달',
  nextMonth: '다음 달',
  prevMonth: '지난 달',
  all: '전체',
} as const

function quickButtonClass(active: boolean): string {
  return [
    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
    active
      ? 'bg-amber-500 text-white'
      : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
  ].join(' ')
}

export function VehicleAssignmentDateFilterBar({
  filter,
  showDefaultMonthNotice,
  showAllWarning,
}: Props) {
  const router = useRouter()
  const quick = vehicleAssignmentQuickRangeUrls()
  const [from, setFrom] = useState(filter.from ?? '')
  const [to, setTo] = useState(filter.to ?? '')

  const applyCustomRange = () => {
    router.push(buildVehicleAssignmentListHref(from || null, to || null))
  }

  return (
    <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      {showDefaultMonthNotice && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
          {VEHICLE_ASSIGNMENT_DEFAULT_RANGE_NOTICE}
        </p>
      )}
      {showAllWarning && (
        <p className="text-sm text-orange-800 bg-orange-50 border border-orange-100 rounded-md px-3 py-2">
          {VEHICLE_ASSIGNMENT_ALL_RANGE_WARNING}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href={quick.fromToday} className={quickButtonClass(filter.range === 'from_today')}>
          {QUICK_LABELS.fromToday}
        </Link>
        <Link href={quick.forwardWeek} className={quickButtonClass(filter.range === 'forward_week')}>
          {QUICK_LABELS.forwardWeek}
        </Link>
        <Link href={quick.currentMonth} className={quickButtonClass(filter.range === 'current_month')}>
          {QUICK_LABELS.currentMonth}
        </Link>
        <Link href={quick.nextMonth} className={quickButtonClass(filter.range === 'next_month')}>
          {QUICK_LABELS.nextMonth}
        </Link>
        <Link href={quick.prevMonth} className={quickButtonClass(filter.range === 'prev_month')}>
          {QUICK_LABELS.prevMonth}
        </Link>
        <Link href={quick.all} className={quickButtonClass(filter.range === 'all')}>
          {QUICK_LABELS.all}
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          시작일
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="min-h-10 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          종료일
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="min-h-10 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </label>
        <button
          type="button"
          onClick={applyCustomRange}
          className="min-h-10 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
        >
          조회
        </button>
      </div>
    </div>
  )
}
