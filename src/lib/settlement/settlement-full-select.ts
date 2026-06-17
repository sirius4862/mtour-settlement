/**
 * Explicit column lists for getSettlementFull / save pre-load queries.
 * Keep in sync with guide *_guide_read view columns (see settlement_rls_hardening_migration.sql).
 */

/** Tour fields used by BasicInfoSection and admin/guide detail pages. */
export const SETTLEMENT_FULL_TOUR_SELECT =
  'id, tour_code, pattern, agency_name, start_date, end_date, nights, pax_count, vehicle_type, tc_name'

export const SETTLEMENT_FULL_HEADER_SELECT = [
  'id',
  'tour_id',
  'guide_id',
  'branch_id',
  'status',
  'year_month',
  'exchange_rate',
  'advance_vnd',
  'tour_fee_usd',
  'ground_fee_usd',
  'charming_other_usd',
  'tip_received_usd',
  'option_receivable_usd',
  'tip_transfer_usd',
  'option_credit_usd',
  'vehicle_fee_usd',
  'head_tax_usd',
  'seoul_biz_fee_usd',
  'tc_guide_usd',
  'tc_company_usd',
  'megugi_usd',
  'guide_daily_fee_usd',
  'settlement_ratio',
  'guide_note',
  'admin_note',
  'reject_reason',
  'submitted_at',
  'reviewed_at',
  'paid_at',
  'edit_requested_at',
  'reviewed_by',
  'edit_requested_by',
  'sent_for_confirmation_at',
  'sent_for_confirmation_by',
  'guide_confirmed_at',
  'guide_confirmed_by',
  'clarification_requested_at',
  'clarification_message',
  'active_confirmation_id',
  'guide_submit_snapshot_id',
  'calc_summary_json',
].join(', ')

export const SETTLEMENT_FULL_SELECT =
  `${SETTLEMENT_FULL_HEADER_SELECT}, tour:tours(${SETTLEMENT_FULL_TOUR_SELECT})`

export const HOTEL_ITEMS_FULL_SELECT =
  'id, hotel_name, check_in_date, nights, sgl_count, twn_count, trp_count, unit_price_sgl_usd, unit_price_trp_usd, company_amount_usd, guide_amount_usd, sort_order'

export const MEAL_ITEMS_FULL_SELECT =
  'id, meal_date, restaurant_name, pax, unit_price_vnd, amount_vnd, sort_order'

export const ENTRANCE_ITEMS_FULL_SELECT =
  'id, visit_date, attraction_name, pax, unit_price_vnd, amount_vnd, sort_order'

export const OTHER_EXPENSE_ITEMS_FULL_SELECT =
  'id, description, days, pax, unit_price_usd, unit_price_vnd, amount_usd, amount_vnd, is_tip, entry_mode, note, sort_order'

export const SHOPPING_ITEMS_FULL_SELECT =
  'id, visit_date, shop_name, sale_usd, com_usd, kb_usd, sort_order'

export const OPTION_ITEMS_FULL_SELECT =
  'id, option_date, option_name, unit_price_usd, pax, total_sale_usd, expense_usd, expense_vnd, com_usd, is_extra_vehicle, sort_order'

export const COMPANY_EXPENSE_ITEMS_FULL_SELECT =
  'id, description, amount_usd, amount_vnd, note, sort_order'

export const RECEIPTS_FULL_SELECT =
  'id, hotel_id, meal_id, entrance_id, other_id, shopping_id, option_id, storage_path, file_name, file_size, mime_type, uploaded_by, created_at'

export const LINE_ITEM_FULL_SELECT = {
  hotel_items: HOTEL_ITEMS_FULL_SELECT,
  meal_items: MEAL_ITEMS_FULL_SELECT,
  entrance_items: ENTRANCE_ITEMS_FULL_SELECT,
  other_expense_items: OTHER_EXPENSE_ITEMS_FULL_SELECT,
  shopping_items: SHOPPING_ITEMS_FULL_SELECT,
  option_items: OPTION_ITEMS_FULL_SELECT,
  receipts: RECEIPTS_FULL_SELECT,
} as const

export type LineItemFullSelectTable = keyof typeof LINE_ITEM_FULL_SELECT

/** Columns present in guide read views used by full-load (structural compatibility check). */
export const GUIDE_READ_VIEW_COLUMNS: Record<
  | 'settlements_guide_read'
  | 'hotel_items_guide_read'
  | 'meal_items_guide_read'
  | 'entrance_items_guide_read'
  | 'other_expense_items_guide_read'
  | 'shopping_items_guide_read'
  | 'option_items_guide_read'
  | 'receipts_guide_read',
  readonly string[]
> = {
  settlements_guide_read: SETTLEMENT_FULL_HEADER_SELECT.split(',').map((c) => c.trim()),
  hotel_items_guide_read: [
    'id',
    'settlement_id',
    'hotel_name',
    'check_in_date',
    'nights',
    'sgl_count',
    'twn_count',
    'trp_count',
    'unit_price_sgl_usd',
    'unit_price_trp_usd',
    'company_amount_usd',
    'guide_amount_usd',
    'sort_order',
    'created_at',
    'updated_at',
  ],
  meal_items_guide_read: ['*'],
  entrance_items_guide_read: ['*'],
  other_expense_items_guide_read: ['*'],
  option_items_guide_read: ['*'],
  shopping_items_guide_read: [
    'id',
    'settlement_id',
    'visit_date',
    'shop_name',
    'sale_usd',
    'com_usd',
    'kb_usd',
    'sort_order',
    'created_at',
    'updated_at',
  ],
  receipts_guide_read: ['*'],
}

export function lineItemFullSelect(table: LineItemFullSelectTable): string {
  return LINE_ITEM_FULL_SELECT[table]
}

export function assertGuideReadSelectCompatible(
  table: LineItemFullSelectTable,
  viewName: keyof typeof GUIDE_READ_VIEW_COLUMNS,
): void {
  const selectCols = LINE_ITEM_FULL_SELECT[table].split(',').map((c) => c.trim())
  const viewCols = GUIDE_READ_VIEW_COLUMNS[viewName]
  if (viewCols.length === 1 && viewCols[0] === '*') return
  for (const col of selectCols) {
    if (!viewCols.includes(col)) {
      throw new Error(`Guide read select mismatch: ${viewName} lacks column ${col}`)
    }
  }
}
