import type { Tour, Receipt, SettlementStatus } from '@/types'
import type { SettlementHeaderCalc } from './types-calc'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface DraftMeta {
  clientId: string
  deleted?: boolean
}

export interface DraftHotelRow extends DraftMeta {
  id?: string
  hotel_name: string
  check_in_date: string | null
  nights: number
  sgl_count: number
  twn_count: number
  trp_count: number
  unit_price_sgl_usd: number
  unit_price_trp_usd: number
  guide_amount_usd: number
}

export interface DraftMealRow extends DraftMeta {
  id?: string
  meal_date: string | null
  restaurant_name: string
  pax: number
  unit_price_vnd: number
}

export interface DraftEntranceRow extends DraftMeta {
  id?: string
  visit_date: string | null
  attraction_name: string
  pax: number
  unit_price_vnd: number
}

export interface DraftOtherRow extends DraftMeta {
  id?: string
  description: string
  amount_usd: number
  amount_vnd: number
  note: string | null
}

/** Admin-only 회사 비용 rows (회사 입력 항목). */
export interface DraftCompanyExpenseRow extends DraftMeta {
  id?: string
  description: string
  amount_usd: number
  amount_vnd: number
  note: string | null
}

export interface DraftShoppingRow extends DraftMeta {
  id?: string
  visit_date: string | null
  shop_name: string
  sale_usd: number
  com_usd: number
  kb_usd: number
}

export interface DraftOptionRow extends DraftMeta {
  id?: string
  option_date: string | null
  option_name: string
  unit_price_usd: number
  pax: number
  expense_usd: number
  expense_vnd: number
  is_extra_vehicle?: boolean
}

export interface SettlementFormHeader extends SettlementHeaderCalc {
  guide_note: string | null
}

export interface SettlementFormState {
  settlementId: string | null
  tourId: string | null
  tour: Tour | null
  guideName: string
  exchange_rate: number
  header: SettlementFormHeader
  hotels: DraftHotelRow[]
  meals: DraftMealRow[]
  entrances: DraftEntranceRow[]
  others: DraftOtherRow[]
  companyExpenses: DraftCompanyExpenseRow[]
  shoppings: DraftShoppingRow[]
  options: DraftOptionRow[]
  receipts: Receipt[]
  settlementStatus: SettlementStatus | null
  /** Required for admin 「가이드 최종확인 요청」 after guide submit. */
  guideSubmitSnapshotId: string | null
  dirty: boolean
  saveStatus: SaveStatus
  lastSavedAt: string | null
  saveError: string | null
}

export type LineSection =
  | 'hotels'
  | 'meals'
  | 'entrances'
  | 'others'
  | 'shoppings'
  | 'options'
