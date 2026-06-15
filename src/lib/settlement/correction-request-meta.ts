/**

 * Encode/decode admin correction requests in settlements.admin_note (no SQL).

 * v1: section chips + shared reason

 * v2: targeted targets (section/row/field) with per-target reason

 * Legacy plain admin_note remains valid.

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



export type CorrectionKind =

  | 'section'

  | 'section_missing'

  | 'row'

  | 'amount_mismatch'



export type CorrectionFieldId =

  | 'unit_price_usd'

  | 'unit_price_vnd'

  | 'pax'

  | 'guide_amount_usd'

  | 'sale_usd'

  | 'com_usd'

  | 'amount_usd'

  | 'amount_vnd'



export type CorrectionTarget = {

  section: CorrectionSectionId

  kind: CorrectionKind

  rowId: string | null

  clientId: string | null

  rowLabel: string | null

  field: CorrectionFieldId | null

  reason: string

  proposed: string | null

}



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



const FIELD_ID_SET = new Set<string>([

  'unit_price_usd',

  'unit_price_vnd',

  'pax',

  'guide_amount_usd',

  'sale_usd',

  'com_usd',

  'amount_usd',

  'amount_vnd',

])



const KIND_SET = new Set<string>(['section', 'section_missing', 'row', 'amount_mismatch'])



const V1_STRUCTURED_NOTE_RE =

  /^@@correction@@sections=([a-z0-9,-]+)@@\/correction@@\r?\n?([\s\S]*)$/i



const V2_STRUCTURED_NOTE_RE =

  /^@@correction@@v=2@@targets=([A-Za-z0-9_-]+)@@\/correction@@\r?\n?([\s\S]*)$/i



export type ParsedCorrectionNote = {

  reason: string

  sections: CorrectionSectionId[]

  targets: CorrectionTarget[]

  /** True when the structured marker is present in admin_note. */

  isStructured: boolean

  version: 1 | 2 | null

  rawNote: string | null

}



export function isCorrectionSectionId(value: string): value is CorrectionSectionId {

  return SECTION_ID_SET.has(value)

}



export function isCorrectionFieldId(value: string): value is CorrectionFieldId {

  return FIELD_ID_SET.has(value)

}



export function getCorrectionSectionLabel(id: CorrectionSectionId): string {

  return CORRECTION_SECTIONS.find((s) => s.id === id)?.label ?? id

}



export function getCorrectionSectionDefaultMessage(id: CorrectionSectionId): string | undefined {

  return CORRECTION_SECTIONS.find((s) => s.id === id)?.defaultMessage

}



function encodeTargetsBase64(payload: { targets: CorrectionTarget[] }): string {

  const json = JSON.stringify(payload)

  if (typeof Buffer !== 'undefined') {

    return Buffer.from(json, 'utf8').toString('base64url')

  }

  const bytes = new TextEncoder().encode(json)

  let binary = ''

  for (const b of bytes) binary += String.fromCharCode(b)

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

}



function decodeTargetsBase64(encoded: string): { targets: CorrectionTarget[] } | null {

  try {

    let json: string

    if (typeof Buffer !== 'undefined') {

      json = Buffer.from(encoded, 'base64url').toString('utf8')

    } else {

      const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')

      const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))

      const binary = atob(padded + pad)

      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))

      json = new TextDecoder().decode(bytes)

    }

    const parsed = JSON.parse(json) as { targets?: unknown }

    if (!parsed || !Array.isArray(parsed.targets)) return null

    return { targets: normalizeTargets(parsed.targets) }

  } catch {

    return null

  }

}



function normalizeTargets(raw: unknown[]): CorrectionTarget[] {

  const out: CorrectionTarget[] = []

  for (const item of raw) {

    if (!item || typeof item !== 'object') continue

    const t = item as Partial<CorrectionTarget>

    if (!t.section || !isCorrectionSectionId(t.section)) continue

    if (!t.kind || !KIND_SET.has(t.kind)) continue

    const reason = typeof t.reason === 'string' ? t.reason.trim() : ''

    if (!reason) continue

    out.push({

      section: t.section,

      kind: t.kind as CorrectionKind,

      rowId: typeof t.rowId === 'string' && t.rowId ? t.rowId : null,

      clientId: typeof t.clientId === 'string' && t.clientId ? t.clientId : null,

      rowLabel: typeof t.rowLabel === 'string' && t.rowLabel.trim() ? t.rowLabel.trim() : null,

      field:

        typeof t.field === 'string' && isCorrectionFieldId(t.field) ? t.field : null,

      reason,

      proposed:

        typeof t.proposed === 'string' && t.proposed.trim() ? t.proposed.trim() : null,

    })

  }

  return out

}



function deriveSectionsFromTargets(targets: CorrectionTarget[]): CorrectionSectionId[] {

  const seen = new Set<CorrectionSectionId>()

  const sections: CorrectionSectionId[] = []

  for (const t of targets) {

    if (!seen.has(t.section)) {

      seen.add(t.section)

      sections.push(t.section)

    }

  }

  return sections

}



function deriveReasonFromTargets(targets: CorrectionTarget[], summary: string): string {

  if (summary.trim()) return summary.trim()

  if (targets.length === 1) return targets[0].reason

  return targets.map((t) => t.reason).filter(Boolean).join(' / ')

}



/** v1 encode — kept for backward compatibility and tests. */

export function encodeCorrectionNote(

  sections: CorrectionSectionId[],

  reason: string,

): string {

  const trimmedReason = reason.trim()

  const unique = [...new Set(sections)]

  const marker = `${CORRECTION_MARKER_START}sections=${unique.join(',')}${CORRECTION_MARKER_END}`

  return `${marker}\n${trimmedReason}`

}



/** v2 encode — primary path for contextual correction marking. */

export function encodeCorrectionNoteFromTargets(

  targets: CorrectionTarget[],

  summaryNote?: string,

): string {

  const normalized = normalizeTargets(targets)

  const encoded = encodeTargetsBase64({ targets: normalized })

  const marker = `${CORRECTION_MARKER_START}v=2@@targets=${encoded}${CORRECTION_MARKER_END}`

  const summary = summaryNote?.trim()

  if (summary) return `${marker}\n${summary}`

  return marker

}



export function sectionsToTargets(

  sections: CorrectionSectionId[],

  reason: string,

  kind: CorrectionKind = 'section',

): CorrectionTarget[] {

  const trimmed = reason.trim()

  return [...new Set(sections)].map((section) => ({

    section,

    kind,

    rowId: null,

    clientId: null,

    rowLabel: null,

    field: null,

    reason: trimmed,

    proposed: null,

  }))

}



export function parseCorrectionNote(

  adminNote: string | null | undefined,

): ParsedCorrectionNote {

  const raw = adminNote ?? null

  if (!raw?.trim()) {

    return {

      reason: '',

      sections: [],

      targets: [],

      isStructured: false,

      version: null,

      rawNote: raw,

    }

  }



  const v2Match = raw.match(V2_STRUCTURED_NOTE_RE)

  if (v2Match) {

    const payload = decodeTargetsBase64(v2Match[1] ?? '')

    const summary = (v2Match[2] ?? '').trim()

    const targets = payload?.targets ?? []

    return {

      reason: deriveReasonFromTargets(targets, summary),

      sections: deriveSectionsFromTargets(targets),

      targets,

      isStructured: true,

      version: 2,

      rawNote: raw,

    }

  }



  const v1Match = raw.match(V1_STRUCTURED_NOTE_RE)

  if (v1Match) {

    const sectionPart = v1Match[1] ?? ''

    const reason = (v1Match[2] ?? '').trim()

    const sections = sectionPart

      .split(',')

      .map((s) => s.trim())

      .filter(isCorrectionSectionId)

    const targets = sectionsToTargets(sections, reason)

    return {

      reason,

      sections,

      targets,

      isStructured: true,

      version: 1,

      rawNote: raw,

    }

  }



  return {

    reason: raw.trim(),

    sections: [],

    targets: [],

    isStructured: false,

    version: null,

    rawNote: raw,

  }

}



/** Display text for list/dashboard cards — prefers parsed reason body. */

export function correctionReasonForDisplay(adminNote: string | null | undefined): string {

  const parsed = parseCorrectionNote(adminNote)

  return parsed.reason

}



export function validateCorrectionTargets(

  targets: CorrectionTarget[],

): { ok: true } | { ok: false; error: string } {

  if (targets.length === 0) {

    return { ok: false, error: '수정이 필요한 항목을 최소 1개 지정해주세요.' }

  }

  for (const target of targets) {

    if (!target.reason.trim()) {

      return { ok: false, error: '수정요청 사유를 입력해주세요.' }

    }

    if (!isCorrectionSectionId(target.section)) {

      return { ok: false, error: '유효하지 않은 섹션입니다.' }

    }

  }

  return { ok: true }

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

  return validateCorrectionTargets(sectionsToTargets(sections, reason))

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

    if (!parsed.isStructured) {

      return { ok: false, error: '수정요청 형식이 올바르지 않습니다.' }

    }

    if (parsed.version === 2) {

      return validateCorrectionTargets(parsed.targets)

    }

    if (parsed.sections.length === 0) {

      return { ok: false, error: '수정이 필요한 섹션을 선택해주세요.' }

    }

  }

  if (!parsed.reason.trim()) {

    return { ok: false, error: '수정요청 사유를 입력해주세요.' }

  }

  return { ok: true }

}



export function getTargetsForSection(

  parsed: ParsedCorrectionNote,

  sectionId: CorrectionSectionId,

): CorrectionTarget[] {

  return parsed.targets.filter((t) => t.section === sectionId)

}



export function sectionAttentionMessage(

  parsed: ParsedCorrectionNote,

  sectionId: CorrectionSectionId,

): string | undefined {

  const targets = getTargetsForSection(parsed, sectionId)

  if (targets.length === 0) return undefined

  const defaultMsg = getCorrectionSectionDefaultMessage(sectionId)

  const rowless = targets.filter((t) => t.kind === 'section' || t.kind === 'section_missing')

  if (rowless.length > 0) {

    return rowless.map((t) => t.reason).join(' ') || defaultMsg

  }

  const stale = targets.filter(

    (t) => (t.kind === 'row' || t.kind === 'amount_mismatch') && t.rowLabel,

  )

  if (stale.length > 0 && targets.every((t) => t.kind !== 'section' && t.kind !== 'section_missing')) {

    return stale.map((t) => `「${t.rowLabel}」 항목 확인: ${t.reason}`).join(' ')

  }

  return defaultMsg ?? targets[0]?.reason

}



export type RowMatchInput = {

  id?: string | null

  clientId: string

  label?: string | null

}



export function correctionTargetMatchesRow(

  target: CorrectionTarget,

  row: RowMatchInput,

): boolean {

  if (target.rowId && row.id && target.rowId === row.id) return true

  if (target.clientId && target.clientId === row.clientId) return true

  if (target.rowLabel && row.label) {

    return target.rowLabel.trim().toLowerCase() === row.label.trim().toLowerCase()

  }

  return false

}



export function findMatchingRowTarget(

  targets: CorrectionTarget[],

  row: RowMatchInput,

): CorrectionTarget | undefined {

  return targets.find(

    (t) =>

      (t.kind === 'row' || t.kind === 'amount_mismatch') &&

      correctionTargetMatchesRow(t, row),

  )

}



export const SEND_FOR_CONFIRMATION_WARNING =

  '가이드 최종확인 요청은 수정요청이 아니라 최종 확인 절차입니다. 옵션, 식사, 입장료 등 가이드 입력 항목이 누락되었거나 틀렸다면 먼저 「가이드 수정 요청」을 보내세요. 정산서가 정확한 경우에만 계속 진행하세요.'



export const CORRECTION_FIELD_LABELS: Record<CorrectionFieldId, string> = {

  unit_price_usd: '단가($)',

  unit_price_vnd: '단가(₫)',

  pax: '인원',

  guide_amount_usd: '가이드결재',

  sale_usd: 'SALE',

  com_usd: 'COM',

  amount_usd: '금액($)',

  amount_vnd: '금액(₫)',

}



export function correctionFieldLabel(field: CorrectionFieldId | null): string | undefined {
  if (!field) return undefined
  return CORRECTION_FIELD_LABELS[field]
}



export function defaultAmountFieldForSection(

  section: CorrectionSectionId,

): CorrectionFieldId | null {

  switch (section) {

    case 'meals':

    case 'entrances':

      return 'unit_price_vnd'

    case 'options':

      return 'unit_price_usd'

    case 'hotels':

      return 'guide_amount_usd'

    case 'shopping':

      return 'sale_usd'

    case 'others':

      return 'amount_usd'

    default:

      return null

  }

}



export function emptyCorrectionTarget(

  section: CorrectionSectionId,

  overrides: Partial<CorrectionTarget> = {},

): CorrectionTarget {

  return {

    section,

    kind: 'section',

    rowId: null,

    clientId: null,

    rowLabel: null,

    field: null,

    reason: '',

    proposed: null,

    ...overrides,

  }

}


