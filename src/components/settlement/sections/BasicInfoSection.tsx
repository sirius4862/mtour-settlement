'use client'

import type { Tour } from '@/types'
import type { AnnotatedNumber } from '@/lib/settlement/types-calc'
import { tourLabel } from '@/lib/settlement/mappers'
import { ManualField, ReadOnlyField, SectionCard } from '@/components/ui/FormPrimitives'
import { CalculatedField } from '../CalculatedField'
import { SectionHint } from '../SectionHint'
import { EXCEL_SECTIONS } from '@/lib/settlement/excel-sections'
import { useSettlementFormStore } from '@/lib/stores/settlementFormStore'
import { useSettlementFormRole } from '../SettlementFormContext'

interface Props {
  tours: Tour[]
  advanceUsd: AnnotatedNumber
  readOnlyTour?: boolean
}

export function BasicInfoSection({ tours, advanceUsd, readOnlyTour }: Props) {
  const role = useSettlementFormRole()
  const tour = useSettlementFormStore((s) => s.tour)
  const tourId = useSettlementFormStore((s) => s.tourId)
  const exchange_rate = useSettlementFormStore((s) => s.exchange_rate)
  const header = useSettlementFormStore((s) => s.header)
  const guideName = useSettlementFormStore((s) => s.guideName)
  const setTour = useSettlementFormStore((s) => s.setTour)
  const setExchangeRate = useSettlementFormStore((s) => s.setExchangeRate)
  const patchHeader = useSettlementFormStore((s) => s.patchHeader)

  return (
    <div className="space-y-4">
      <SectionHint excelRows={EXCEL_SECTIONS.basic.rows} hint={EXCEL_SECTIONS.basic.hint} />
      {!readOnlyTour && !tourId && (
        <SectionCard>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            투어 선택 <span className="text-red-500">*</span>
          </label>
          <select
            value={tourId ?? ''}
            onChange={(e) => {
              const t = tours.find((x) => x.id === e.target.value)
              if (t) setTour(t)
            }}
            className="w-full min-h-12 px-3 border border-gray-200 rounded-xl bg-white"
          >
            <option value="">투어를 선택하세요</option>
            {tours.map((t) => (
              <option key={t.id} value={t.id}>{tourLabel(t)}</option>
            ))}
          </select>
        </SectionCard>
      )}

      {tour && (
        <SectionCard>
          <div className="grid grid-cols-2 gap-3">
            <ReadOnlyField label="투어코드" value={tour.tour_code} />
            <ReadOnlyField label="패턴" value={tour.pattern} />
            <ReadOnlyField label="여행사" value={tour.agency_name} />
            <ReadOnlyField label="인원" value={`${tour.pax_count}명`} />
            <ReadOnlyField label="기간" value={`${tour.start_date} ~ ${tour.end_date}`} />
            <ReadOnlyField label="차량" value={tour.vehicle_type ?? '—'} />
            <ReadOnlyField label="가이드" value={guideName} />
            <ReadOnlyField label="TC" value={tour.tc_name ?? '—'} />
          </div>
        </SectionCard>
      )}

      <SectionCard>
        <ManualField
          label="환율 (VND/USD)"
          excelRef="Q2"
          suffix="₫/$"
          required
          inputMode="decimal"
          value={exchange_rate || ''}
          disabled={role === 'admin'}
          onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)}
        />
        <ManualField
          label="전도금 (VND)"
          excelRef="A76"
          suffix="₫"
          inputMode="decimal"
          value={header.advance_vnd || ''}
          disabled={role === 'admin'}
          onChange={(e) => patchHeader({ advance_vnd: parseFloat(e.target.value) || 0 })}
        />
        <CalculatedField field={advanceUsd} />
        <ManualField
          label="가이드 메모"
          value={header.guide_note ?? ''}
          disabled={role === 'admin'}
          onChange={(e) => patchHeader({ guide_note: e.target.value.trim() || null })}
        />
      </SectionCard>
    </div>
  )
}
