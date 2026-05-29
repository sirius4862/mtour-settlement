import type { AnnotatedNumber } from './types-calc'

export function uiFormulaLabel(field: AnnotatedNumber): string {
  return field.formula
}
