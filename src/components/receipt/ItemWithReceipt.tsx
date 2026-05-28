'use client'

import { receiptTargetLabel } from '@/lib/receipt/targets'
import type { ReceiptTarget } from '@/lib/receipt/types'
import { isReceiptEditable, useSettlementFormStore } from '@/lib/stores/settlementFormStore'
import { ReceiptUpload } from './ReceiptUpload'

export function ItemWithReceipt({
  target,
  rowLabel,
  compact = true,
}: {
  target: ReceiptTarget
  rowLabel?: string
  compact?: boolean
}) {
  const settlementId = useSettlementFormStore((s) => s.settlementId)
  const settlementStatus = useSettlementFormStore((s) => s.settlementStatus)
  const editable = isReceiptEditable({ settlementStatus })

  const disabledReason = !editable
    ? '제출·승인·지급된 정산서는 영수증을 수정할 수 없습니다.'
    : undefined

  return (
    <div className="pt-2 border-t border-gray-100 mt-2">
      <p className="text-[10px] font-medium text-gray-500 mb-2">
        {receiptTargetLabel(target, rowLabel)}
      </p>
      <ReceiptUpload
        settlementId={settlementId}
        target={target}
        editable={editable}
        disabledReason={disabledReason}
        compact={compact}
      />
    </div>
  )
}
