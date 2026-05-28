import type { Receipt } from '@/types'

export type ReceiptTargetKind =
  | 'settlement'
  | 'hotel'
  | 'meal'
  | 'entrance'
  | 'other'
  | 'shopping'
  | 'option'

export interface ReceiptTarget {
  kind: ReceiptTargetKind
  /** DB row id — required for line-item targets */
  rowId?: string
}

export type ReceiptFkColumns = Pick<
  Receipt,
  'hotel_id' | 'meal_id' | 'entrance_id' | 'other_id' | 'shopping_id' | 'option_id'
>

export const RECEIPT_BUCKET = 'receipts' as const
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024
export const RECEIPT_ALLOWED_MIME = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const
