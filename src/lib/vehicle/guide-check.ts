// ============================================================================
// Guide vehicle-report check — pure label/validation helpers (no I/O).
// A guide checks a SUBMITTED vehicle report once: 이상없음 / 이상있음 (+ optional
// memo). Insert-once: there is no update/delete in v1. This module NEVER touches
// settlements, payout, money, calculation, settlement status, or paid-lock.
//
// List-level status is intentionally simple (only two states):
//   no check row yet → 가이드 미확인
//   check row exists  → 가이드 확인
// Detail-only the specific result is shown: 이상없음 / 이상있음 (+ note).
// ============================================================================

export type GuideCheckStatus = 'no_issue' | 'issue_reported'

export const GUIDE_ISSUE_NOTE_MAX = 2000

/** List-level label — only 가이드 미확인 / 가이드 확인 (no 미작성/제출완료/이상…). */
export function guideCheckListStatusLabel(hasCheck: boolean): string {
  return hasCheck ? '가이드 확인' : '가이드 미확인'
}

/** Detail-only label for a concrete check result. */
export function guideCheckDetailLabel(status: GuideCheckStatus): string {
  return status === 'issue_reported' ? '이상있음' : '이상없음'
}

export interface GuideCheckPayload {
  check_status: GuideCheckStatus
  issue_note: string
}

function normalizeNote(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, GUIDE_ISSUE_NOTE_MAX)
}

/**
 * Normalize an untrusted guide-check payload. `no_issue` never keeps a note;
 * `issue_reported` keeps an optional trimmed/length-capped note. Any unknown
 * check_status falls back to 'no_issue' here — submit validation rejects it.
 */
export function normalizeGuideCheckPayload(input: unknown): GuideCheckPayload {
  const record = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const status: GuideCheckStatus = record.check_status === 'issue_reported' ? 'issue_reported' : 'no_issue'
  return {
    check_status: status,
    issue_note: status === 'issue_reported' ? normalizeNote(record.issue_note) : '',
  }
}

export type GuideCheckValidation =
  | { ok: true; payload: GuideCheckPayload }
  | { ok: false; error: string }

/**
 * Validation for submitting a guide check.
 *   - check_status must be exactly 'no_issue' or 'issue_reported'
 *   - issue_note is optional (v1) and only kept for issue_reported
 */
export function validateGuideCheckForSubmit(input: unknown): GuideCheckValidation {
  const record = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const raw = record.check_status
  if (raw !== 'no_issue' && raw !== 'issue_reported') {
    return { ok: false, error: '이상 여부를 선택해주세요.' }
  }
  return { ok: true, payload: normalizeGuideCheckPayload(record) }
}
