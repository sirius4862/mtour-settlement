import { describe, expect, it } from 'vitest'
import {
  CORRECTION_SECTIONS,
  adminMemoInputValue,
  correctionReasonForDisplay,
  correctionTargetMatchesRow,
  encodeCorrectionNote,
  encodeCorrectionNoteFromTargets,
  hasStructuredCorrectionNote,
  parseCorrectionNote,
  sectionAttentionMessage,
  sectionsToTargets,
  validateCorrectionRequestInput,
  validateCorrectionTargets,
  validateEncodedCorrectionNote,
  type CorrectionTarget,
} from './correction-request-meta'

const sampleTarget = (overrides: Partial<CorrectionTarget> = {}): CorrectionTarget => ({
  section: 'options',
  kind: 'section_missing',
  rowId: null,
  clientId: null,
  rowLabel: null,
  field: null,
  reason: '보트투어 옵션 누락',
  proposed: null,
  ...overrides,
})

describe('correction-request-meta v1', () => {
  it('encodes and parses sections + reason', () => {
    const encoded = encodeCorrectionNote(['options', 'meals'], '옵션 항목이 누락되었습니다.')
    expect(encoded).toContain('@@correction@@sections=options,meals@@/correction@@')
    expect(encoded).toContain('옵션 항목이 누락되었습니다.')

    const parsed = parseCorrectionNote(encoded)
    expect(parsed.isStructured).toBe(true)
    expect(parsed.version).toBe(1)
    expect(parsed.sections).toEqual(['options', 'meals'])
    expect(parsed.reason).toBe('옵션 항목이 누락되었습니다.')
    expect(parsed.targets).toHaveLength(2)
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
    expect(parsed.targets).toEqual([])
    expect(parsed.reason).toBe(legacy)
    expect(correctionReasonForDisplay(legacy)).toBe(legacy)
    expect(adminMemoInputValue(legacy)).toBe(legacy)
    expect(hasStructuredCorrectionNote(legacy)).toBe(false)
  })

  it('admin memo input hides raw v1 and v2 encoded correction metadata', () => {
    const v1 = encodeCorrectionNote(['options'], '옵션 누락')
    expect(adminMemoInputValue(v1)).toBe('')
    expect(correctionReasonForDisplay(v1)).toBe('옵션 누락')
    expect(hasStructuredCorrectionNote(v1)).toBe(true)
    expect(v1).toContain('@@correction@@sections=')

    const v2 = encodeCorrectionNoteFromTargets([sampleTarget()])
    expect(adminMemoInputValue(v2)).toBe('')
    expect(correctionReasonForDisplay(v2)).toContain('보트투어 옵션 누락')
    expect(hasStructuredCorrectionNote(v2)).toBe(true)
    expect(v2).toContain('@@correction@@v=2@@targets=')
  })

  it('validateCorrectionRequestInput requires reason and section', () => {
    expect(validateCorrectionRequestInput([], '').ok).toBe(false)
    expect(validateCorrectionRequestInput(['options'], '').ok).toBe(false)
    expect(validateCorrectionRequestInput([], '사유').ok).toBe(false)
    expect(validateCorrectionRequestInput(['options'], '사유').ok).toBe(true)
    expect(
      validateCorrectionRequestInput(['guide-adjustments'], '메꾸기 금액 확인해 주세요').ok,
    ).toBe(true)
  })

  it('guide-adjustments section encodes and validates for request_edit payload', () => {
    const encoded = encodeCorrectionNoteFromTargets(
      sectionsToTargets(['guide-adjustments'], '메꾸기 금액 확인해 주세요'),
    )
    expect(validateEncodedCorrectionNote(encoded).ok).toBe(true)
    const parsed = parseCorrectionNote(encoded)
    expect(parsed.sections).toEqual(['guide-adjustments'])
    expect(parsed.reason).toBe('메꾸기 금액 확인해 주세요')
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
})

describe('correction-request-meta v2', () => {
  it('round-trips targeted correction metadata', () => {
    const targets = [
      sampleTarget(),
      sampleTarget({
        section: 'meals',
        kind: 'amount_mismatch',
        rowId: 'meal-1',
        clientId: 'c-meal-1',
        rowLabel: 'Pho 24',
        field: 'unit_price_vnd',
        reason: '단가 확인 필요',
        proposed: '120000',
      }),
    ]
    const encoded = encodeCorrectionNoteFromTargets(targets)
    expect(encoded).toContain('@@correction@@v=2@@targets=')

    const parsed = parseCorrectionNote(encoded)
    expect(parsed.version).toBe(2)
    expect(parsed.isStructured).toBe(true)
    expect(parsed.targets).toHaveLength(2)
    expect(parsed.targets[1]).toMatchObject({
      section: 'meals',
      rowId: 'meal-1',
      clientId: 'c-meal-1',
      rowLabel: 'Pho 24',
      field: 'unit_price_vnd',
      proposed: '120000',
    })
    expect(parsed.sections).toEqual(['options', 'meals'])
  })

  it('validateCorrectionTargets requires at least one target with reason', () => {
    expect(validateCorrectionTargets([]).ok).toBe(false)
    expect(validateCorrectionTargets([sampleTarget({ reason: '' })]).ok).toBe(false)
    expect(validateCorrectionTargets([sampleTarget()]).ok).toBe(true)
  })

  it('validateEncodedCorrectionNote accepts v2 encoded note', () => {
    const encoded = encodeCorrectionNoteFromTargets([sampleTarget()])
    expect(validateEncodedCorrectionNote(encoded).ok).toBe(true)
  })

  it('matches rows by rowId, clientId, or rowLabel', () => {
    const target = sampleTarget({
      kind: 'amount_mismatch',
      rowId: 'id-1',
      clientId: 'c-1',
      rowLabel: 'Boat Tour',
      field: 'unit_price_usd',
    })
    expect(correctionTargetMatchesRow(target, { id: 'id-1', clientId: 'x', label: 'Other' })).toBe(
      true,
    )
    expect(correctionTargetMatchesRow(target, { id: 'x', clientId: 'c-1', label: 'Other' })).toBe(
      true,
    )
    expect(correctionTargetMatchesRow(target, { id: 'x', clientId: 'x', label: 'boat tour' })).toBe(
      true,
    )
    expect(correctionTargetMatchesRow(target, { id: 'x', clientId: 'x', label: 'missing' })).toBe(
      false,
    )
  })

  it('sectionAttentionMessage uses target reason for missing options', () => {
    const parsed = parseCorrectionNote(
      encodeCorrectionNoteFromTargets([sampleTarget({ section: 'options', kind: 'section_missing' })]),
    )
    expect(sectionAttentionMessage(parsed, 'options')).toContain('보트투어 옵션 누락')
  })

  it('sectionAttentionMessage falls back to rowLabel for stale row targets', () => {
    const parsed = parseCorrectionNote(
      encodeCorrectionNoteFromTargets([
        sampleTarget({
          section: 'meals',
          kind: 'amount_mismatch',
          rowLabel: 'Pho 24',
          reason: '단가 확인',
        }),
      ]),
    )
    expect(sectionAttentionMessage(parsed, 'meals')).toContain('Pho 24')
  })

  it('covers all required section labels', () => {
    const labels = CORRECTION_SECTIONS.map((s) => s.label)
    expect(labels).toContain('기본정보')
    expect(labels).toContain('옵션')
    expect(labels).toContain('정산 요약')
  })
})
