/** Supabase views — DB-redacted reads for guide role (see settlement_rls_hardening_migration.sql). */
export const GUIDE_READ = {
  settlements: 'settlements_guide_read',
  hotel_items: 'hotel_items_guide_read',
  meal_items: 'meal_items_guide_read',
  entrance_items: 'entrance_items_guide_read',
  other_expense_items: 'other_expense_items_guide_read',
  shopping_items: 'shopping_items_guide_read',
  option_items: 'option_items_guide_read',
  receipts: 'receipts_guide_read',
  settlement_snapshots: 'settlement_snapshots_guide_read',
  settlement_confirmations: 'settlement_confirmations_guide_read',
  settlement_field_changes: 'settlement_field_changes_guide_read',
} as const

export type GuideReadTable = (typeof GUIDE_READ)[keyof typeof GUIDE_READ]
