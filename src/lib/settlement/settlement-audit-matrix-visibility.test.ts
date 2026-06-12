import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { shouldShowSettlementAuditMatrix } from './display-labels'

const ROOT = process.cwd()

const ADMIN_DETAIL = readFileSync(
  join(ROOT, 'src/app/admin/settlements/[id]/page.tsx'),
  'utf8',
)
const GUIDE_DETAIL = readFileSync(
  join(ROOT, 'src/app/guide/settlements/[id]/page.tsx'),
  'utf8',
)
const FINAL_SUMMARY = readFileSync(
  join(ROOT, 'src/components/settlement/sections/FinalSummarySection.tsx'),
  'utf8',
)
const SETTLEMENT_FORM = readFileSync(
  join(ROOT, 'src/components/settlement/SettlementForm.tsx'),
  'utf8',
)

describe('shouldShowSettlementAuditMatrix', () => {
  const original = process.env.NEXT_PUBLIC_SETTLEMENT_AUDIT_MATRIX

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_SETTLEMENT_AUDIT_MATRIX
    } else {
      process.env.NEXT_PUBLIC_SETTLEMENT_AUDIT_MATRIX = original
    }
  })

  it('is false by default (normal production UI)', () => {
    delete process.env.NEXT_PUBLIC_SETTLEMENT_AUDIT_MATRIX
    expect(shouldShowSettlementAuditMatrix()).toBe(false)
  })

  it('is true only when NEXT_PUBLIC_SETTLEMENT_AUDIT_MATRIX=true', () => {
    process.env.NEXT_PUBLIC_SETTLEMENT_AUDIT_MATRIX = 'true'
    expect(shouldShowSettlementAuditMatrix()).toBe(true)
    process.env.NEXT_PUBLIC_SETTLEMENT_AUDIT_MATRIX = 'false'
    expect(shouldShowSettlementAuditMatrix()).toBe(false)
  })
})

describe('user-facing settlement screens — audit matrix hidden', () => {
  it('admin detail gates 감사용 상세 계산 behind debug flag', () => {
    expect(ADMIN_DETAIL).toContain('shouldShowSettlementAuditMatrix()')
    expect(ADMIN_DETAIL).not.toMatch(
      /<SettlementAuditMatrix[\s\S]*?\/>\s*<\/div>\s*\{\/\* 항목 테이블/,
    )
    const summaryBlock = ADMIN_DETAIL.slice(
      ADMIN_DETAIL.indexOf('정산 요약'),
      ADMIN_DETAIL.indexOf('항목 테이블'),
    )
    expect(summaryBlock).toContain('SettlementBusinessSummary')
    expect(summaryBlock).toContain('shouldShowSettlementAuditMatrix()')
  })

  it('guide detail does not render 감사용 상세 계산', () => {
    expect(GUIDE_DETAIL).not.toContain('감사용 상세 계산')
    expect(GUIDE_DETAIL).not.toContain('SettlementAuditMatrix')
  })

  it('FinalSummarySection gates audit matrix and keeps business summary', () => {
    expect(FINAL_SUMMARY).toContain('shouldShowSettlementAuditMatrix()')
    expect(FINAL_SUMMARY).toContain('SettlementBusinessSummary')
    expect(FINAL_SUMMARY).toContain('{showAuditMatrix && (')
    expect(FINAL_SUMMARY).toContain('<SettlementAuditMatrix calc={calc} settlementRatio={settlementRatio} />')
  })

  it('SettlementForm still renders 정산 요약 via FinalSummarySection', () => {
    expect(SETTLEMENT_FORM).toContain("title: '정산 요약'")
    expect(SETTLEMENT_FORM).toContain('<FinalSummarySection')
  })
})

describe('user-facing settlement screens — business summaries remain', () => {
  it('admin detail keeps 정산 결과 and 정산 요약', () => {
    expect(ADMIN_DETAIL).toContain('정산 결과')
    expect(ADMIN_DETAIL).toContain('정산 요약')
    expect(ADMIN_DETAIL).toContain('SettlementBusinessSummary')
  })

  it('guide detail keeps 정산 요약', () => {
    expect(GUIDE_DETAIL).toContain('정산 요약')
  })
})
