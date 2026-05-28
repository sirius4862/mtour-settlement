import type { SettlementFormState } from './form-types'

export type ValidationSeverity = 'error' | 'warning'

export interface ValidationIssue {
  sectionId: string
  message: string
  severity: ValidationSeverity
}

export type ValidationIntent = 'draft' | 'submit'

function activeRows<T extends { deleted?: boolean }>(rows: T[] | undefined): T[] {
  return (rows ?? []).filter((r) => !r.deleted)
}

/** Validate form before draft save or submit. Errors block the action; warnings are informational. */
export function validateSettlementForm(
  state: SettlementFormState,
  intent: ValidationIntent,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!state.tourId || !state.tour) {
    issues.push({
      sectionId: 'basic',
      message: '투어를 선택해주세요.',
      severity: 'error',
    })
  }

  if (!state.exchange_rate || state.exchange_rate <= 0) {
    issues.push({
      sectionId: 'basic',
      message: '환율(Q2)은 0보다 커야 합니다.',
      severity: 'error',
    })
  }

  if (state.header.advance_vnd < 0) {
    issues.push({
      sectionId: 'basic',
      message: '전도금(A76)은 0 이상이어야 합니다.',
      severity: 'warning',
    })
  }

  const hotels = activeRows(state.hotels)
  const meals = activeRows(state.meals)
  const entrances = activeRows(state.entrances)
  const others = activeRows(state.others)
  const shoppings = activeRows(state.shoppings)
  const options = activeRows(state.options)

  if (intent === 'submit') {
    if (state.header.tour_fee_usd <= 0) {
      issues.push({
        sectionId: 'basic',
        message: '투어피(D79)를 입력해주세요.',
        severity: 'error',
      })
    }

    const hasLineItems =
      hotels.length + meals.length + entrances.length + others.length + shoppings.length + options.length > 0

    if (!hasLineItems) {
      issues.push({
        sectionId: 'hotels',
        message: '최소 1개 이상의 지출/수익 항목을 입력해주세요.',
        severity: 'error',
      })
    }

    hotels.forEach((row, i) => {
      if (!row.hotel_name.trim()) {
        issues.push({
          sectionId: 'hotels',
          message: `호텔 #${i + 1}: 호텔명을 입력해주세요.`,
          severity: 'warning',
        })
      }
    })

    meals.forEach((row, i) => {
      if (row.pax <= 0 && row.unit_price_vnd <= 0) {
        issues.push({
          sectionId: 'meals',
          message: `식사 #${i + 1}: 인원(E) 또는 단가(F)를 입력해주세요.`,
          severity: 'warning',
        })
      }
    })
  }

  if (issues.length === 0 && intent === 'draft' && !state.settlementId) {
    issues.push({
      sectionId: 'basic',
      message: '임시저장 후 영수증 첨부 및 제출이 가능합니다.',
      severity: 'warning',
    })
  }

  return issues
}

export function validationErrors(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter((i) => i.severity === 'error')
}

export function firstErrorSection(issues: ValidationIssue[]): string | null {
  return validationErrors(issues)[0]?.sectionId ?? issues[0]?.sectionId ?? null
}
