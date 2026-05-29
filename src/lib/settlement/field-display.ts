import type { AnnotatedNumber } from './types-calc'

/** Tour fee (D79) is entered only in BasicInfoSection; elsewhere it is display-only. */
export function uiFormulaLabel(field: AnnotatedNumber): string {
  if (field.excelRef === 'D79') return '회사 선지급 · Q75 차감 (R87 미포함)'
  return field.formula
}
