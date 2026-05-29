'use client'

import { useSettlementFormStore } from '@/lib/stores/settlementFormStore'
import { ManualField, SectionCard } from '@/components/ui/FormPrimitives'
import { CalculatedField } from '../CalculatedField'
import { SectionHint } from '../SectionHint'
import { EXCEL_SECTIONS } from '@/lib/settlement/excel-sections'
import { useSettlementFormCalc } from '@/hooks/useSettlementFormCalc'
import { useSettlementFormRole } from '../SettlementFormContext'
import { EXTERNAL_RECEIVABLE_HINT } from '@/lib/settlement/external-receivable'

function parseNonNegativeUsd(value: string): number {
  return Math.max(0, parseFloat(value) || 0)
}

export function CashReconciliationSection() {
  const role = useSettlementFormRole()
  const header = useSettlementFormStore((s) => s.header)
  const patchHeader = useSettlementFormStore((s) => s.patchHeader)
  const cash = useSettlementFormCalc().sections.cash
  const isAdmin = role === 'admin'

  return (
    <div className="space-y-3">
      <SectionHint excelRows={EXCEL_SECTIONS.cash.rows} hint={EXCEL_SECTIONS.cash.hint} />
      <SectionCard>
        <div className="grid gap-3">
          <ManualField
            label="차밍쇼/기타 (USD)"
            excelRef="D75"
            suffix="$"
            inputMode="decimal"
            value={header.charming_other_usd || ''}
            disabled={isAdmin}
            onChange={(e) =>
              patchHeader({ charming_other_usd: parseNonNegativeUsd(e.target.value) })
            }
          />
          <ManualField
            label="받은 팁 (USD)"
            excelRef="F75"
            suffix="$"
            inputMode="decimal"
            value={header.tip_received_usd || ''}
            disabled={isAdmin}
            onChange={(e) =>
              patchHeader({ tip_received_usd: parseNonNegativeUsd(e.target.value) })
            }
          />
          <ManualField
            label="옵션외상 (USD)"
            excelRef="P75"
            suffix="$"
            inputMode="decimal"
            value={header.option_receivable_usd || ''}
            disabled={isAdmin}
            onChange={(e) =>
              patchHeader({ option_receivable_usd: parseNonNegativeUsd(e.target.value) })
            }
          />
          <ManualField
            label="팁송금 (USD)"
            excelRef="P75"
            suffix="$"
            inputMode="decimal"
            value={header.tip_transfer_usd || ''}
            disabled={isAdmin}
            onChange={(e) =>
              patchHeader({ tip_transfer_usd: parseNonNegativeUsd(e.target.value) })
            }
          />
          <p className="text-xs text-gray-500 -mt-1">{EXTERNAL_RECEIVABLE_HINT}</p>
        </div>
      </SectionCard>
      <div className="grid gap-2">
        <CalculatedField field={cash.income_total_usd} />
        <CalculatedField field={cash.guide_expense_deposit_usd} />
        {isAdmin && (
          <>
            <CalculatedField field={cash.option_receivable_usd} />
            <CalculatedField field={cash.tip_transfer_usd} />
            <CalculatedField field={cash.option_credit_usd} />
          </>
        )}
        <CalculatedField field={cash.company_deposit_usd} />
      </div>
    </div>
  )
}
