import type { Receipt } from '@/types'
import type { ReceiptFkColumns, ReceiptTarget, ReceiptTargetKind } from './types'

export function receiptTargetToColumns(target: ReceiptTarget): ReceiptFkColumns {
  return {
    hotel_id: target.kind === 'hotel' ? (target.rowId ?? null) : null,
    meal_id: target.kind === 'meal' ? (target.rowId ?? null) : null,
    entrance_id: target.kind === 'entrance' ? (target.rowId ?? null) : null,
    other_id: target.kind === 'other' ? (target.rowId ?? null) : null,
    shopping_id: target.kind === 'shopping' ? (target.rowId ?? null) : null,
    option_id: target.kind === 'option' ? (target.rowId ?? null) : null,
  }
}

export function isSettlementReceipt(receipt: Receipt): boolean {
  return (
    !receipt.hotel_id &&
    !receipt.meal_id &&
    !receipt.entrance_id &&
    !receipt.other_id &&
    !receipt.shopping_id &&
    !receipt.option_id
  )
}

export function receiptMatchesTarget(receipt: Receipt, target: ReceiptTarget): boolean {
  if (target.kind === 'settlement') return isSettlementReceipt(receipt)
  const cols = receiptTargetToColumns(target)
  return Object.entries(cols).some(([, id]) => id && id === target.rowId)
}

export function filterReceiptsForTarget(receipts: Receipt[], target: ReceiptTarget): Receipt[] {
  return receipts.filter((r) => receiptMatchesTarget(r, target))
}

export const TARGET_LABELS: Record<ReceiptTargetKind, string> = {
  settlement: '정산서 전체',
  hotel: '호텔',
  meal: '식사',
  entrance: '입장료',
  other: '기타지출',
  shopping: '쇼핑',
  option: '옵션',
}

export function receiptTargetLabel(target: ReceiptTarget, rowLabel?: string): string {
  if (target.kind === 'settlement') return TARGET_LABELS.settlement
  return rowLabel ? `${TARGET_LABELS[target.kind]} · ${rowLabel}` : TARGET_LABELS[target.kind]
}
