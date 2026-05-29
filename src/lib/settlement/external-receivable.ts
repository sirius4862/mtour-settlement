/** External receivable (외상) — company-account collections, not on-site guide cash. */

export type ExternalReceivableFields = {
  option_receivable_usd?: number | null
  tip_transfer_usd?: number | null
  option_credit_usd?: number | null
}

export const EXTERNAL_RECEIVABLE_HINT =
  '현장에서 가이드가 받은 현금이 아니라 회사 계좌로 입금된 금액입니다.'

/** P75 = option_receivable_usd + tip_transfer_usd; legacy option_credit_usd fallback. */
export function resolveOptionCreditUsd(row: ExternalReceivableFields): number {
  const receivable = row.option_receivable_usd ?? 0
  const transfer = row.tip_transfer_usd ?? 0
  const splitSum = receivable + transfer
  if (splitSum > 0) return splitSum
  return row.option_credit_usd ?? 0
}

/** Load legacy combined P75 into split fields for form/display when split values are empty. */
export function normalizeExternalReceivableForForm(row: ExternalReceivableFields): {
  option_receivable_usd: number
  tip_transfer_usd: number
} {
  const receivable = row.option_receivable_usd ?? 0
  const transfer = row.tip_transfer_usd ?? 0
  if (receivable + transfer > 0) {
    return { option_receivable_usd: receivable, tip_transfer_usd: transfer }
  }
  const legacy = row.option_credit_usd ?? 0
  if (legacy > 0) {
    return { option_receivable_usd: legacy, tip_transfer_usd: 0 }
  }
  return { option_receivable_usd: 0, tip_transfer_usd: 0 }
}

/** DB write: keep legacy option_credit_usd in sync with split fields. */
export function externalReceivableDbFields(
  header: Pick<ExternalReceivableFields, 'option_receivable_usd' | 'tip_transfer_usd'>,
): {
  option_receivable_usd: number
  tip_transfer_usd: number
  option_credit_usd: number
} {
  const option_receivable_usd = Math.max(0, header.option_receivable_usd ?? 0)
  const tip_transfer_usd = Math.max(0, header.tip_transfer_usd ?? 0)
  return {
    option_receivable_usd,
    tip_transfer_usd,
    option_credit_usd: option_receivable_usd + tip_transfer_usd,
  }
}
