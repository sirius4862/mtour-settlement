/**
 * Encode/decode admin correction requests in settlements.admin_note (no SQL).
 * Legacy plain admin_note remains valid: shown as top-level reason without section highlights.
 */

export const CORRECTION_MARKER_START = '@@correction@@'
export const CORRECTION_MARKER_END = '@@/correction@@'

export type CorrectionSectionId =
  | 'basic'
  | 'hotels'
  | 'meals'
  | 'entrances'
  | 'others'
  | 'shopping'
  | 'options'
  | 'cash'
  | 'tc'
  | 'guide-adjustments'
  | 'adjustments'
  | 'summary'

export const CORRECTION_SECTIONS: ReadonlyArray<{
  id: CorrectionSectionId
  label: string
  defaultMessage?: string
}> = [
  { id: 'basic', label: '기본정보' },
  { id: 'hotels', label: '호텔' },
  { id: 'meals', label: '식사' },
  { id: 'entrances', label: '입장료' },
  { id: 'others', label: '기타지출' },
  { id: 'shopping', label: '쇼핑' },
  {
    id: 'options',
    label: '옵션',
    defaultMessage: '옵션 항목을 확인해주세요. 누락되었거나 금액이 틀렸다면 다시 입력해주세요.',
  },
  { id: 'cash', label: '입금 정리' },
  { id: 'tc', label: 'T/C 정산' },
  { id: 'guide-adjustments', label: '메꾸기·가이드 일비' },
  { id: 'adjustments', label: '회사 입력 항목' },
  { id: 'summary', label: '정산 요약' },
] as const

const SECTION_ID_SET = new Set<string>(CORRECTION_SECTIONS.map((s) => s.id))

const STRUCTURED_NOTE_RE =
  /^@@correction@@sections=([a-z0-9,-]+)@@\/correction@@\r?\n?([\s\S]*)$/i

export type ParsedCorrectionNote = {
  reason: string
  sections: CorrectionSectionId[]
  /** True when the structured marker is present in admin_note. */
  isStructured: boolean
  rawNote: string | null
}

export function isCorrectionSectionId(value: string): value is CorrectionSectionId {
  return SECTION_ID_SET.has(value)
}

export function getCorrectionSectionLabel(id: CorrectionSectionId): string {
  return CORRECTION_SECTIONS.find((s) => s.id === id)?.label ?? id
}

export function getCorrectionSectionDefaultMessage(id: CorrectionSectionId): string | undefined {
  return CORRECTION_SECTIONS.find((s) => s.id === id)?.defaultMessage
}

export function encodeCorrectionNote(
  sections: CorrectionSectionId[],
  reason: string,
): string {
  const trimmedReason = reason.trim()
  const unique = [...new Set(sections)]
  const marker = `${CORRECTION_MARKER_START}sections=${unique.join(',')}${CORRECTION_MARKER_END}`
  return `${marker}\n${trimmedReason}`
}

export function parseCorrectionNote(
  adminNote: string | null | undefined,
): ParsedCorrectionNote {
  const raw = adminNote ?? null
  if (!raw?.trim()) {
    return { reason: '', sections: [], isStructured: false, rawNote: raw }
  }

  const match = raw.match(STRUCTURED_NOTE_RE)
  if (match) {
    const sectionPart = match[1] ?? ''
    const reason = (match[2] ?? '').trim()
    const sections = sectionPart
      .split(',')
      .map((s) => s.trim())
      .filter(isCorrectionSectionId)
    return { reason, sections, isStructured: true, rawNote: raw }
  }

  return { reason: raw.trim(), sections: [], isStructured: false, rawNote: raw }
}

/** Display text for list/dashboard cards — prefers parsed reason body. */
export function correctionReasonForDisplay(adminNote: string | null | undefined): string {
  const parsed = parseCorrectionNote(adminNote)
  return parsed.reason
}

export function validateCorrectionRequestInput(
  sections: CorrectionSectionId[],
  reason: string,
): { ok: true } | { ok: false; error: string } {
  if (!reason.trim()) {
    return { ok: false, error: '수정요청 사유를 입력해주세요.' }
  }
  if (sections.length === 0) {
    return { ok: false, error: '수정이 필요한 섹션을 최소 1개 선택해주세요.' }
  }
  return { ok: true }
}

export function validateEncodedCorrectionNote(
  adminNote: string | null | undefined,
): { ok: true } | { ok: false; error: string } {
  const trimmed = adminNote?.trim()
  if (!trimmed) {
    return { ok: false, error: '수정요청 사유를 입력해주세요.' }
  }
  const parsed = parseCorrectionNote(trimmed)
  if (trimmed.includes(CORRECTION_MARKER_START)) {
    if (!parsed.isStructured || parsed.sections.length === 0) {
      return { ok: false, error: '수정이 필요한 섹션을 선택해주세요.' }
    }
  }
  if (!parsed.reason.trim()) {
    return { ok: false, error: '수정요청 사유를 입력해주세요.' }
  }
  return { ok: true }
}

export const SEND_FOR_CONFIRMATION_WARNING =
  '가이드 최종확인 요청은 수정요청이 아니라 최종 확인 절차입니다. 옵션, 식사, 입장료 등 가이드 입력 항목이 누락되었거나 틀렸다면 먼저 「가이드 수정 요청」을 보내세요. 정산서가 정확한 경우에만 계속 진행하세요.'
