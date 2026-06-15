import { describe, expect, it } from 'vitest'
import {
  CORRECTION_SECTIONS,
  correctionReasonForDisplay,
  encodeCorrectionNote,
  parseCorrectionNote,
  validateCorrectionRequestInput,
  validateEncodedCorrectionNote,
} from './correction-request-meta'

describe('correction-request-meta', () => {
  it('encodes and parses sections + reason', () => {
    const encoded = encodeCorrectionNote(['options', 'meals'], '옵션 항목이 누락되었습니다.')
    expect(encoded).toContain('@@correction@@sections=options,meals@@/correction@@')
    expect(encoded).toContain('옵션 항목이 누락되었습니다.')

    const parsed = parseCorrectionNote(encoded)
    expect(parsed.isStructured).toBe(true)
    expect(parsed.sections).toEqual(['options', 'meals'])
    expect(parsed.reason).toBe('옵션 항목이 누락되었습니다.')
  })

  it('deduplicates section ids on encode', () => {
    const encoded = encodeCorrectionNote(['options', 'options'], '확인 필요')
    expect(encoded).toContain('sections=options@@/correction@@')
  })

  it('legacy plain admin_note still displays as correction reason', () => {
    const legacy = '옵션 금액을 다시 확인해주세요.'
    const parsed = parseCorrectionNote(legacy)
    expect(parsed.isStructured).toBe(false)
    expect(parsed.sections).toEqual([])
    expect(parsed.reason).toBe(legacy)
    expect(correctionReasonForDisplay(legacy)).toBe(legacy)
  })

  it('validateCorrectionRequestInput requires reason and section', () => {
    expect(validateCorrectionRequestInput([], '').ok).toBe(false)
    expect(validateCorrectionRequestInput(['options'], '').ok).toBe(false)
    expect(validateCorrectionRequestInput([], '사유').ok).toBe(false)
    expect(validateCorrectionRequestInput(['options'], '사유').ok).toBe(true)
  })

  it('validateEncodedCorrectionNote rejects empty and structured-without-sections', () => {
    expect(validateEncodedCorrectionNote('').ok).toBe(false)
    expect(validateEncodedCorrectionNote(null).ok).toBe(false)
    expect(
      validateEncodedCorrectionNote('@@correction@@sections=@@/correction@@\n').ok,
    ).toBe(false)
    expect(validateEncodedCorrectionNote(encodeCorrectionNote(['options'], '사유')).ok).toBe(true)
    expect(validateEncodedCorrectionNote('legacy plain note').ok).toBe(true)
  })

  it('covers all required section labels', () => {
    const labels = CORRECTION_SECTIONS.map((s) => s.label)
    expect(labels).toContain('기본정보')
    expect(labels).toContain('옵션')
    expect(labels).toContain('정산 요약')
  })
})
