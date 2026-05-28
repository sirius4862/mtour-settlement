'use client'

import { useSettlementFormStore } from '@/lib/stores/settlementFormStore'
import { ManualField, SectionCard } from '@/components/ui/FormPrimitives'

export function TCSettlementSection() {
  const header = useSettlementFormStore((s) => s.header)
  const patchHeader = useSettlementFormStore((s) => s.patchHeader)

  return (
    <SectionCard>
      <ManualField
        label="T/C 정산 — 가이드분 (USD)"
        excelRef="H83"
        suffix="$"
        inputMode="decimal"
        value={header.tc_guide_usd || ''}
        onChange={(e) =>
          patchHeader({ tc_guide_usd: parseFloat(e.target.value) || 0 })
        }
      />
      <ManualField
        label="T/C 정산 — 회사분 (USD)"
        excelRef="J83"
        suffix="$"
        inputMode="decimal"
        value={header.tc_company_usd || ''}
        onChange={(e) =>
          patchHeader({ tc_company_usd: parseFloat(e.target.value) || 0 })
        }
      />
    </SectionCard>
  )
}

export function FinalAdjustmentsSection() {
  const header = useSettlementFormStore((s) => s.header)
  const patchHeader = useSettlementFormStore((s) => s.patchHeader)

  return (
    <SectionCard>
      <ManualField
        label="차량비 (포함)"
        excelRef="O79"
        suffix="$"
        inputMode="decimal"
        value={header.vehicle_fee_usd || ''}
        onChange={(e) =>
          patchHeader({ vehicle_fee_usd: parseFloat(e.target.value) || 0 })
        }
      />
      <ManualField
        label="인두세"
        excelRef="O80"
        suffix="$"
        inputMode="decimal"
        value={header.head_tax_usd || ''}
        onChange={(e) =>
          patchHeader({ head_tax_usd: parseFloat(e.target.value) || 0 })
        }
      />
      <ManualField
        label="서울영업비"
        excelRef="O81"
        suffix="$"
        inputMode="decimal"
        value={header.seoul_biz_fee_usd || ''}
        onChange={(e) =>
          patchHeader({ seoul_biz_fee_usd: parseFloat(e.target.value) || 0 })
        }
      />
      <ManualField
        label="메꾸기"
        excelRef="R80"
        suffix="$"
        inputMode="decimal"
        value={header.megugi_usd || ''}
        onChange={(e) =>
          patchHeader({ megugi_usd: parseFloat(e.target.value) || 0 })
        }
      />
      <ManualField
        label="가이드 일비"
        excelRef="R82"
        suffix="$"
        inputMode="decimal"
        value={header.guide_daily_fee_usd || ''}
        onChange={(e) =>
          patchHeader({ guide_daily_fee_usd: parseFloat(e.target.value) || 0 })
        }
      />
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          정산비율{' '}
          <span className="font-mono text-blue-600 ml-1">
            {Math.round(header.settlement_ratio * 100)}% (R77)
          </span>
        </label>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={Math.round(header.settlement_ratio * 100)}
          onChange={(e) =>
            patchHeader({ settlement_ratio: parseInt(e.target.value, 10) / 100 })
          }
          className="w-full min-h-12 accent-blue-600"
        />
        <p className="text-[10px] font-mono text-gray-400 mt-1">R77 · 슬라이더</p>
      </div>
    </SectionCard>
  )
}
