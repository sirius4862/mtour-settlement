'use client'

import { useRouter } from 'next/navigation'
import {
  GUIDE_VEHICLE_REPORT_PERIOD_HELPER,
  GUIDE_VEHICLE_REPORT_PERIOD_LABELS,
  GUIDE_VEHICLE_REPORT_PERIODS,
  buildGuideVehicleReportsUrl,
  type GuideVehicleReportPeriod,
} from '@/lib/vehicle/guide-vehicle-report-list'

type Props = {
  period: GuideVehicleReportPeriod
}

export function GuideVehicleReportPeriodFilter({ period }: Props) {
  const router = useRouter()

  return (
    <div className="rounded-[22px] border border-[#E9DED2] bg-[#FFFDF9] px-4 py-3 shadow-[0_4px_18px_rgba(43,33,24,0.025)]">
      <p className="text-[11px] leading-relaxed text-[#8B7B6E]">{GUIDE_VEHICLE_REPORT_PERIOD_HELPER}</p>
      <label className="mt-2 block text-xs text-[#8B7B6E]">
        기간
        <select
          name="period"
          value={period}
          onChange={(e) => router.push(buildGuideVehicleReportsUrl(e.target.value))}
          className="mt-1 w-full rounded-xl border border-[#E9DED2] bg-white px-3 py-2 text-sm text-[#2B2118]"
        >
          {GUIDE_VEHICLE_REPORT_PERIODS.map((value) => (
            <option key={value} value={value}>
              {GUIDE_VEHICLE_REPORT_PERIOD_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
