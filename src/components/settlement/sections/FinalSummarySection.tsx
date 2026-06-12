'use client'

import type { SettlementCalcResult } from '@/lib/settlement/types-calc'
import {
  Q75_NEGATIVE_WARNING,
  companyDepositIsNegative,
  shouldShowSettlementAuditMatrix,
  type SummaryAudience,
} from '@/lib/settlement/display-labels'
import { EXCEL_SECTIONS } from '@/lib/settlement/excel-sections'
import { SectionHint } from '../SectionHint'
import { SettlementAuditMatrix } from './SettlementAuditMatrix'
import { SettlementBusinessSummary } from './SettlementBusinessSummary'

export function FinalSummarySection({
  calc,
  settlementRatio,
  audience = 'guide',
}: {
  calc: SettlementCalcResult
  settlementRatio: number
  audience?: SummaryAudience
}) {
  const q75IsNegative = companyDepositIsNegative(calc.sections.cash.company_deposit_usd.value)
  const showAuditMatrix = shouldShowSettlementAuditMatrix()

  return (
    <div className="space-y-4">
      <SectionHint excelRows={EXCEL_SECTIONS.summary.rows} hint={EXCEL_SECTIONS.summary.hint} />

      {q75IsNegative && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {Q75_NEGATIVE_WARNING}
        </p>
      )}

      <SettlementBusinessSummary calc={calc} audience={audience} />

      {showAuditMatrix && (
        <SettlementAuditMatrix calc={calc} settlementRatio={settlementRatio} />
      )}
    </div>
  )
}
