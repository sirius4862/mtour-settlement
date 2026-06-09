'use client'

import { useState } from 'react'
import {
  GUIDE_HISTORY_PERIOD_HELPER,
  GUIDE_HISTORY_PERIOD_LABELS,
  type GuideHistoryPeriod,
} from '@/lib/guide/settlement-history'

const PERIOD_OPTIONS = [
  '7d',
  '30d',
  'current_month',
  'prev_month',
  'custom',
] as const satisfies readonly GuideHistoryPeriod[]

type StatusOption = { value: string; label: string }

type Props = {
  status: string
  period: GuideHistoryPeriod
  from: string
  to: string
  search: string
  statusOptions: StatusOption[]
}

export function GuideHistoryFilterForm({
  status,
  period,
  from,
  to,
  search,
  statusOptions,
}: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState<GuideHistoryPeriod>(period)

  return (
    <form className="bg-white rounded-2xl border border-gray-100 p-3 space-y-2">
      <p className="text-[11px] leading-relaxed text-gray-500">{GUIDE_HISTORY_PERIOD_HELPER}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-500">
          상태
          <select
            name="status"
            defaultValue={status}
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-800"
          >
            <option value="">전체</option>
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          기간
          <select
            name="period"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as GuideHistoryPeriod)}
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-800"
          >
            {PERIOD_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {GUIDE_HISTORY_PERIOD_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selectedPeriod === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-500">
            시작일
            <input
              type="date"
              name="from"
              defaultValue={from}
              required
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-800"
            />
          </label>
          <label className="text-xs text-gray-500">
            종료일
            <input
              type="date"
              name="to"
              defaultValue={to}
              required
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-800"
            />
          </label>
        </div>
      )}
      <label className="block text-xs text-gray-500">
        검색
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="투어명 또는 투어코드"
          className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-800"
        />
      </label>
      <button
        type="submit"
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
      >
        조회
      </button>
    </form>
  )
}
