'use client'

import {
  correctionFieldLabel,
  defaultAmountFieldForSection,
  type CorrectionSectionId,
} from '@/lib/settlement/correction-request-meta'
import { CorrectionRowAction } from '../CorrectionRequestModal'
import { CorrectionRowAlert } from '../GuideCorrectionBanner'
import { useCorrectionRequest, useGuideCorrectionHighlight } from '../SettlementFormContext'

export function LineItemCorrectionToolbar({
  section,
  rowId,
  clientId,
  rowLabel,
}: {
  section: CorrectionSectionId
  rowId?: string | null
  clientId: string
  rowLabel?: string | null
}) {
  const correction = useCorrectionRequest()
  if (!correction?.canRequest) return null

  const field = defaultAmountFieldForSection(section)
  return (
    <div className="flex justify-end pb-1">
      <CorrectionRowAction
        onClick={() =>
          correction.requestRow({
            section,
            kind: field ? 'amount_mismatch' : 'row',
            rowId: rowId ?? null,
            clientId,
            rowLabel: rowLabel?.trim() || null,
            field,
          })
        }
      />
    </div>
  )
}

export function LineItemCorrectionAlert({ clientId }: { clientId: string }) {
  const highlight = useGuideCorrectionHighlight()
  const hl = highlight?.getRowHighlight(clientId)
  if (!hl) return null

  return (
    <CorrectionRowAlert
      message={hl.message}
      proposed={hl.proposed}
      fieldLabel={hl.field ? correctionFieldLabel(hl.field) : undefined}
    />
  )
}

export function useLineItemRowListCorrectionProps() {
  const highlight = useGuideCorrectionHighlight()

  return {
    getRowClassName: (row: { clientId: string }) => {
      const hl = highlight?.getRowHighlight(row.clientId)
      if (!hl) return undefined
      const isActive = highlight?.activeJumpClientId === row.clientId
      return 'border-red-300 bg-red-50/80' + (isActive ? ' ring-2 ring-red-500' : '')
    },
    getRowDomId: (row: { clientId: string }) => `correction-row-${row.clientId}`,
  }
}
