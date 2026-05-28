import type { AnnotatedNumber } from './types-calc'

/** Tour fee (D79) is entered only in BasicInfoSection; elsewhere it is display-only. */
export function uiFormulaLabel(field: AnnotatedNumber): string {
  if (field.excelRef === 'D79') return '기본정보 D79 입력값'
  return field.formula
}
