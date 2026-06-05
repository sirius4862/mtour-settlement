import type { AnnotatedNumber } from './types-calc'

export type SummaryAudience = 'guide' | 'admin'

export const GUIDE_PAYOUT_FLOOR_WARNING =
  '가이드 정산금액이 마이너스라 지급액은 $0으로 처리됩니다.'

export const Q75_NEGATIVE_WARNING =
  '가이드 사용액이 회사 입금액보다 많습니다. 회사입금이 마이너스입니다.'

export const R77_REFERENCE_ONLY_NOTE =
  '정산비율(R77)은 참고 전용이며 P85 계산에 반영되지 않습니다.'

export const GUIDE_FOOTER_LABELS = {
  companyDeposit: '회사입금액',
  guideSettlement: '가이드 정산금액',
} as const

/** UI-only labels — does not change calc.ts AnnotatedNumber values. */
export function displayFieldLabel(field: AnnotatedNumber, audience: SummaryAudience): string {
  if (audience === 'guide') {
    if (field.excelRef === 'Q75') return GUIDE_FOOTER_LABELS.companyDeposit
    if (field.excelRef === 'P85') return GUIDE_FOOTER_LABELS.guideSettlement
  }
  if (field.excelRef === 'Q75') return '회사입금'
  if (field.excelRef === 'R85') return audience === 'admin' ? '계산상 가이드정산' : '가이드정산'
  if (field.excelRef === 'P85') return audience === 'admin' ? '실제 지급액' : '가이드정산'
  if (field.excelRef === 'R87') return '회사수익'
  if (field.excelRef === 'F86' && audience === 'admin') return '수익−지출'
  if (field.excelRef === 'R86' && audience === 'admin') return '회사수익 중간값'
  return field.label
}

export function guideSettlementIsNegative(guideSettlementUsd: number): boolean {
  return guideSettlementUsd < 0
}

export function companyDepositIsNegative(companyDepositUsd: number): boolean {
  return companyDepositUsd < 0
}

/** Guide-facing display amount — never negative. */
export function guideDisplaySettlementUsd(guideSettlementUsd: number): number {
  return Math.max(guideSettlementUsd, 0)
}

export function shouldShowGuideSummaryMatrix(audience: SummaryAudience): boolean {
  return audience === 'admin'
}

export function shouldShowMatrixRow(rowKey: string, audience: SummaryAudience): boolean {
  if (audience === 'guide') return false
  if (rowKey === 'r86' || rowKey === 'r87') return audience === 'admin'
  return true
}

export function shouldShowSummaryField(field: AnnotatedNumber, audience: SummaryAudience): boolean {
  if (audience === 'guide') {
    if (field.excelRef === 'R86' || field.excelRef === 'F86') return false
    if (field.excelRef === 'R87') return false
    if (field.excelRef === 'H85') return false
    if (field.excelRef === 'R84') return false
  }
  return true
}
