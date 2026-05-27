// ================================================================
// 타입 정의 — schema_final_clean.sql 완전 일치
// ================================================================

export type UserRole = 'guide' | 'staff' | 'admin'
export type SettlementStatus =
  | 'draft' | 'submitted' | 'approved'
  | 'rejected' | 'edit_requested' | 'paid'

// ── DB Row 타입 ────────────────────────────────────────────────

export interface Branch {
  id: string; name: string; code: string; created_at: string
}

export interface Profile {
  id: string; email: string; full_name: string
  role: UserRole; branch_id: string | null
  agency_name: string | null; phone: string | null
  is_active: boolean; created_at: string; updated_at: string
}

export interface Tour {
  id: string; tour_code: string; pattern: string
  agency_name: string; start_date: string; end_date: string
  nights: number; pax_count: number; vehicle_type: string | null
  guide_id: string; tc_name: string | null; branch_id: string
  created_by: string; created_at: string; updated_at: string
}

export interface Settlement {
  id: string; tour_id: string; guide_id: string
  branch_id: string; status: SettlementStatus; year_month: string
  exchange_rate: number        // 엑셀 Q2 환율
  advance_vnd: number          // 엑셀 A76 전도금 VND
  tour_fee_usd: number         // 엑셀 D79
  charming_other_usd: number   // 엑셀 D75
  tip_received_usd: number     // 엑셀 F75
  option_credit_usd: number    // 엑셀 P75
  vehicle_fee_usd: number      // 엑셀 M79
  head_tax_usd: number         // 엑셀 M80
  seoul_biz_fee_usd: number    // 엑셀 M81
  tc_guide_usd: number         // 엑셀 H83
  tc_company_usd: number       // 엑셀 J83
  megugi_usd: number           // 엑셀 R80
  guide_daily_fee_usd: number  // 엑셀 R82
  settlement_ratio: number     // 엑셀 R77
  guide_note: string | null; admin_note: string | null; reject_reason: string | null
  submitted_at: string | null; reviewed_at: string | null
  paid_at: string | null; edit_requested_at: string | null
  reviewed_by: string | null; edit_requested_by: string | null
  created_at: string; updated_at: string
}

export interface HotelItem {
  id: string; settlement_id: string
  hotel_name: string; check_in_date: string | null; nights: number
  sgl_count: number; twn_count: number; trp_count: number
  unit_price_sgl_usd: number; unit_price_trp_usd: number
  company_amount_usd: number; guide_amount_usd: number
  sort_order: number; created_at: string; updated_at: string
}

export interface MealItem {
  id: string; settlement_id: string
  meal_date: string | null; restaurant_name: string
  pax: number; unit_price_vnd: number; amount_vnd: number
  sort_order: number; created_at: string; updated_at: string
}

export interface EntranceItem {
  id: string; settlement_id: string
  visit_date: string | null; attraction_name: string
  pax: number; unit_price_vnd: number; amount_vnd: number
  sort_order: number; created_at: string; updated_at: string
}

export interface OtherExpenseItem {
  id: string; settlement_id: string
  description: string; days: number | null; pax: number
  unit_price_usd: number; amount_usd: number
  unit_price_vnd: number; amount_vnd: number
  is_tip: boolean; sort_order: number
  created_at: string; updated_at: string
}

export interface ShoppingItem {
  id: string; settlement_id: string
  visit_date: string | null; shop_name: string
  sale_usd: number; com_usd: number; kb_usd: number
  sort_order: number; created_at: string; updated_at: string
}

export interface OptionItem {
  id: string; settlement_id: string
  option_date: string | null; option_name: string
  unit_price_usd: number; pax: number; total_sale_usd: number
  expense_usd: number; expense_vnd: number; com_usd: number
  is_extra_vehicle: boolean; sort_order: number
  created_at: string; updated_at: string
}

export interface Receipt {
  id: string; settlement_id: string
  hotel_id: string | null; meal_id: string | null
  entrance_id: string | null; other_id: string | null
  shopping_id: string | null; option_id: string | null
  storage_path: string; file_name: string
  file_size: number; mime_type: string
  uploaded_by: string; created_at: string
}

export interface StatusLog {
  id: string; settlement_id: string; changed_by: string
  from_status: SettlementStatus | null; to_status: SettlementStatus
  note: string | null; created_at: string
}

// ── JOIN 타입 ──────────────────────────────────────────────────

export interface SettlementWithTour extends Settlement { tour: Tour }

export interface SettlementFull extends Settlement {
  tour: Tour
  hotels: HotelItem[]; meals: MealItem[]; entrances: EntranceItem[]
  others: OtherExpenseItem[]; shoppings: ShoppingItem[]
  options: OptionItem[]; receipts: Receipt[]
}

// ── 상태 메타 ─────────────────────────────────────────────────

export const STATUS_META: Record<SettlementStatus, { label: string; bg: string; text: string }> = {
  draft:          { label: '작성중',   bg: 'bg-gray-100',    text: 'text-gray-600'    },
  submitted:      { label: '제출됨',   bg: 'bg-amber-100',   text: 'text-amber-700'   },
  approved:       { label: '승인됨',   bg: 'bg-emerald-100', text: 'text-emerald-700' },
  rejected:       { label: '반려됨',   bg: 'bg-red-100',     text: 'text-red-600'     },
  edit_requested: { label: '수정요청', bg: 'bg-blue-100',    text: 'text-blue-700'    },
  paid:           { label: '지급완료', bg: 'bg-purple-100',  text: 'text-purple-700'  },
}

export const GUIDE_EDITABLE: SettlementStatus[] = ['draft', 'rejected', 'edit_requested']

export function canGuideEdit(
  s: Pick<Settlement, 'status' | 'guide_id'>,
  uid: string,
): boolean {
  return s.guide_id === uid && GUIDE_EDITABLE.includes(s.status)
}
