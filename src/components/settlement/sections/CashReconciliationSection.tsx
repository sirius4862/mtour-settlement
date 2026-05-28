'use client'

import { useSettlementFormStore } from '@/lib/stores/settlementFormStore'
import { ManualField, SectionCard } from '@/components/ui/FormPrimitives'
import { CalculatedField } from '../CalculatedField'
import { useSettlementFormCalc } from '@/hooks/useSettlementFormCalc'

export function CashReconciliationSection() {
  const header = useSettlementFormStore((s) => s.header)
  const patchHeader = useSettlementFormStore((s) => s.patchHeader)
  const cash = useSettlementFormCalc().sections.cash

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Excel R74–76 · 입력 3개 + 계산 3개</p>
      <SectionCard>
        <div className="grid gap-3">
          <ManualField
            label="차밍쇼/기타 (USD)"
            excelRef="D75"
            suffix="$"
            inputMode="decimal"
            value={header.charming_other_usd || ''}
            onChange={(e) =>
              patchHeader({ charming_other_usd: parseFloat(e.target.value) || 0 })
            }
          />
          <ManualField
            label="받은 팁 (USD)"
            excelRef="F75"
            suffix="$"
            inputMode="decimal"
            value={header.tip_received_usd || ''}
            onChange={(e) =>
              patchHeader({ tip_received_usd: parseFloat(e.target.value) || 0 })
            }
          />
          <ManualField
            label="옵션외상/팁송금 (USD)"
            excelRef="P75"
            suffix="$"
            inputMode="decimal"
            value={header.option_credit_usd || ''}
            onChange={(e) =>
              patchHeader({ option_credit_usd: parseFloat(e.target.value) || 0 })
            }
          />
        </div>
      </SectionCard>
      <div className="grid gap-2">
        <CalculatedField field={cash.income_total_usd} />
        <CalculatedField field={cash.guide_expense_deposit_usd} />
        <CalculatedField field={cash.company_deposit_usd} />
      </div>
    </div>
  )
}
