import type { SettlementFormState } from './form-types'
import { hasGuideOwnedLineItemData } from './field-ownership'

export type ValidationSeverity = 'error' | 'warning'

export interface ValidationIssue {
  sectionId: string
  message: string
  severity: ValidationSeverity
}

export type ValidationIntent = 'draft' | 'submit'
export type ValidationActor = 'guide' | 'admin'

function activeRows<T extends { deleted?: boolean }>(rows: T[] | undefined): T[] {
  return (rows ?? []).filter((r) => !r.deleted)
}

/** Validate form before draft save or submit. Errors block the action; warnings are informational. */
export function validateSettlementForm(
  state: SettlementFormState,
  intent: ValidationIntent,
  actor: ValidationActor = 'guide',
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

  if (intent === 'submit' && actor === 'guide') {
    if (!hasGuideOwnedLineItemData(state)) {
      issues.push({
        sectionId: 'hotels',
        message: '최소 1개 이상의 가이드 입력 항목(호텔·식사·쇼핑 등)을 입력해주세요.',
        severity: 'error',
      })
    }

    issues.push({
      sectionId: 'basic',
      message: '투어피(D79), 지상비(O79–O81), 정산비율(R77)은 제출 후 관리자가 입력합니다.',
      severity: 'warning',
    })
  }

  if (intent === 'submit') {
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
