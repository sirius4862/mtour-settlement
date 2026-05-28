import { annotate } from './calc'
import type { AnnotatedNumber, SettlementHeaderCalc } from './types-calc'

/** Guide "회사 확인 항목" — R80 + R82 only (not R84/R85 settlement pool). */
export function companyReviewSubtotalField(
  header: Pick<SettlementHeaderCalc, 'megugi_usd' | 'guide_daily_fee_usd'>,
): AnnotatedNumber {
  const value = header.megugi_usd + header.guide_daily_fee_usd
  return annotate(value, '회사 확인 항목 합계', 'R80+R82', 'R80+R82')
}
