import type { SnapshotCalcSummary } from './snapshot'

export type SettlementCalcSummaryJson = SnapshotCalcSummary

export function parseSettlementCalcSummaryJson(
  json: unknown,
): SettlementCalcSummaryJson | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  const nums = [
    o.company_deposit_usd,
    o.guide_settlement_usd,
    o.guide_payout_usd,
    o.company_grand_total_usd,
  ]
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  return {
    company_deposit_usd: o.company_deposit_usd as number,
    guide_settlement_usd: o.guide_settlement_usd as number,
    guide_payout_usd: o.guide_payout_usd as number,
    company_grand_total_usd: o.company_grand_total_usd as number,
  }
}

/** Admin list: Q75 allows negative; P85 is floored payout from calc_summary. */
export function formatAdminListUsd(value: number | null | undefined): string {
  if (value == null || value === 0) return '—'
  const sign = value < 0 ? '-' : ''
  return `${sign}$${Math.abs(value).toFixed(2)}`
}
