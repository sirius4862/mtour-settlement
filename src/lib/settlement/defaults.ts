import { nanoid } from 'nanoid'
import type {
  DraftCompanyExpenseRow,
  DraftEntranceRow,
  DraftHotelRow,
  DraftMealRow,
  DraftOptionRow,
  DraftOtherRow,
  DraftShoppingRow,
  SettlementFormHeader,
} from './form-types'

export function newClientId(): string {
  return nanoid(10)
}

export function defaultHeader(): SettlementFormHeader {
  return {
    advance_vnd: 0,
    charming_other_usd: 0,
    tip_received_usd: 0,
    option_receivable_usd: 0,
    tip_transfer_usd: 0,
    ground_fee_usd: 0,
    vehicle_fee_usd: 0,
    head_tax_usd: 0,
    seoul_biz_fee_usd: 0,
    tc_guide_usd: 0,
    tc_company_usd: 0,
    megugi_usd: 0,
    guide_daily_fee_usd: 0,
    settlement_ratio: 0.5,
    guide_note: null,
  }
}

export function emptyHotelRow(): DraftHotelRow {
  return {
    clientId: newClientId(),
    hotel_name: '',
    check_in_date: null,
    nights: 0,
    sgl_count: 0,
    twn_count: 0,
    trp_count: 0,
    unit_price_sgl_usd: 0,
    unit_price_trp_usd: 0,
    guide_amount_usd: 0,
  }
}

export function emptyMealRow(): DraftMealRow {
  return {
    clientId: newClientId(),
    meal_date: null,
    restaurant_name: '',
    pax: 0,
    unit_price_vnd: 0,
  }
}

export function emptyEntranceRow(): DraftEntranceRow {
  return {
    clientId: newClientId(),
    visit_date: null,
    attraction_name: '',
    pax: 0,
    unit_price_vnd: 0,
  }
}

export function emptyOtherRow(preset?: Partial<DraftOtherRow>): DraftOtherRow {
  return {
    clientId: newClientId(),
    description: '',
    amount_usd: 0,
    amount_vnd: 0,
    note: null,
    ...preset,
  }
}

export function emptyCompanyExpenseRow(
  preset?: Partial<DraftCompanyExpenseRow>,
): DraftCompanyExpenseRow {
  return {
    clientId: newClientId(),
    description: '',
    amount_usd: 0,
    amount_vnd: 0,
    note: null,
    ...preset,
  }
}

export function emptyShoppingRow(): DraftShoppingRow {
  return {
    clientId: newClientId(),
    visit_date: null,
    shop_name: '',
    sale_usd: 0,
    com_usd: 0,
    kb_usd: 0,
  }
}

export function emptyOptionRow(extra = false): DraftOptionRow {
  return {
    clientId: newClientId(),
    option_date: null,
    option_name: extra ? '차량비(추가)' : '',
    unit_price_usd: 0,
    pax: 0,
    expense_usd: 0,
    expense_vnd: 0,
    is_extra_vehicle: extra,
  }
}
