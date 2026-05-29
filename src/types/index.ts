// ================================================================
// 타입 정의 — schema_final_clean.sql 완전 일치
// ================================================================

export type UserRole = 'guide' | 'staff' | 'admin'
export type SettlementStatus =
  | 'draft' | 'submitted' | 'approved'
  | 'rejected' | 'edit_requested' | 'paid'
  | 'pending_guide_confirmation' | 'clarification_requested'

export type SettlementSnapshotKind =
  | 'guide_submit' | 'admin_pre_confirm' | 'guide_confirmed'

export type SettlementConfirmationStatus = 'pending' | 'confirmed' | 'superseded'

export type SettlementAuditAction =
  | 'guide_submit'
  | 'admin_save'
  | 'send_for_confirmation'
  | 'guide_confirm'
  | 'guide_clarification'
  | 'admin_reject'
  | 'admin_request_edit'
  | 'admin_pay'
  | 'status_change'

export type SettlementFieldOwner = 'guide' | 'admin' | 'calculated'

// ── DB Row 타입 ────────────────────────────────────────────────

export interface Branch {
  id: string; name: string; code: string; created_at: string
}

export interface Profile {
  id: string; email: string; full_name: string
  korean_name: string | null; vietnamese_name: string | null
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
  tour_fee_usd: number         // deprecated DB column — use ground_fee_usd; not used in calc
  ground_fee_usd: number       // 웹 전용 — company revenue (지상비)
  charming_other_usd: number   // 엑셀 D75
  tip_received_usd: number     // 엑셀 F75
  option_receivable_usd: number // 옵션외상 — P75 component
  tip_transfer_usd: number     // 팁송금 — P75 component
  option_credit_usd: number    // 엑셀 P75 legacy total (= receivable + transfer)
  vehicle_fee_usd: number      // 엑셀 O79 — company expense
  head_tax_usd: number         // 엑셀 O80 — company expense
  seoul_biz_fee_usd: number    // 엑셀 O81 — company expense
  tc_guide_usd: number         // 엑셀 H83
  tc_company_usd: number       // 엑셀 J83
  megugi_usd: number           // 엑셀 R80
  guide_daily_fee_usd: number  // 엑셀 R82
  settlement_ratio: number     // 엑셀 R77
  guide_note: string | null; admin_note: string | null; reject_reason: string | null
  submitted_at: string | null; reviewed_at: string | null
  paid_at: string | null; edit_requested_at: string | null
  reviewed_by: string | null; edit_requested_by: string | null
  sent_for_confirmation_at: string | null
  sent_for_confirmation_by: string | null
  guide_confirmed_at: string | null
  guide_confirmed_by: string | null
  clarification_requested_at: string | null
  clarification_message: string | null
  active_confirmation_id: string | null
  guide_submit_snapshot_id: string | null
  calc_summary_json: Record<string, unknown> | null
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

export interface SettlementSnapshot {
  id: string
  settlement_id: string
  kind: SettlementSnapshotKind
  payload_json: Record<string, unknown>
  calc_summary_json: Record<string, unknown> | null
  created_by: string
  created_at: string
}

export interface SettlementAuditEvent {
  id: string
  settlement_id: string
  actor_id: string
  actor_role: UserRole
  action: SettlementAuditAction
  from_status: SettlementStatus | null
  to_status: SettlementStatus | null
  note: string | null
  created_at: string
}

export interface SettlementConfirmation {
  id: string
  settlement_id: string
  snapshot_before_id: string
  snapshot_after_id: string
  status: SettlementConfirmationStatus
  sent_by: string
  sent_at: string
  confirmed_by: string | null
  confirmed_at: string | null
  r85_before: number | null
  r85_after: number | null
  r87_before: number | null
  r87_after: number | null
  change_count: number
  created_at: string
}

export interface SettlementFieldChange {
  id: string
  settlement_id: string
  confirmation_id: string | null
  audit_event_id: string | null
  field_path: string
  excel_ref: string | null
  label: string
  owner: SettlementFieldOwner
  old_value_json: unknown
  new_value_json: unknown
  old_display: string | null
  new_display: string | null
  created_at: string
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
  draft:          { label: '작성중',       bg: 'bg-gray-100',    text: 'text-gray-600'    },
  submitted:      { label: '제출됨',       bg: 'bg-amber-100',   text: 'text-amber-700'   },
  pending_guide_confirmation: { label: '최종확인 대기', bg: 'bg-orange-100', text: 'text-orange-700' },
  clarification_requested:    { label: '확인 이의',     bg: 'bg-rose-100',   text: 'text-rose-700'   },
  approved:       { label: '최종확인 완료', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  rejected:       { label: '반려됨',       bg: 'bg-red-100',     text: 'text-red-600'     },
  edit_requested: { label: '수정요청',     bg: 'bg-blue-100',    text: 'text-blue-700'    },
  paid:           { label: '지급완료',     bg: 'bg-purple-100',  text: 'text-purple-700'  },
}

export {
  GUIDE_EDITABLE,
  GUIDE_CONFIRM_ONLY,
  ADMIN_EDITABLE,
  ADMIN_PRE_CONFIRM_REVIEW,
  GUIDE_READ_ONLY,
  canGuideEdit,
  canGuideConfirm,
  canGuideRequestClarification,
  canAdminEditSettlement,
  canAdminDirectApprove,
  canAdminReject,
  canAdminRequestEdit,
  canAdminPaySettlement,
  assertAdminReviewAction,
  assertAdminSaveSettlement,
  canAdminSendForConfirmation,
  assertGuideConfirmAction,
  assertAdminSendForConfirmation,
} from '@/lib/settlement/status-guards'
