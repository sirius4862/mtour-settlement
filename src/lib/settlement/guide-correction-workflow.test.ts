import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  canAdminRequestEditOnSettlement,
  canAdminSendForConfirmation,
} from '@/lib/settlement/status-guards'
import {
  encodeCorrectionNote,
  parseCorrectionNote,
  SEND_FOR_CONFIRMATION_WARNING,
  validateEncodedCorrectionNote,
} from '@/lib/settlement/correction-request-meta'
import type { SettlementStatus } from '@/types'

const ROOT = process.cwd()
const ACTIONS = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')
const REVIEW_PANEL = readFileSync(
  join(ROOT, 'src/app/admin/settlements/[id]/ReviewPanel.tsx'),
  'utf8',
)
const SETTLEMENT_FORM = readFileSync(
  join(ROOT, 'src/components/settlement/SettlementForm.tsx'),
  'utf8',
)
const SETTLEMENT_FORM_FOOTER = readFileSync(
  join(ROOT, 'src/components/settlement/SettlementFormFooter.tsx'),
  'utf8',
)
const SETTLEMENT_ACCORDION = readFileSync(
  join(ROOT, 'src/components/settlement/SettlementAccordion.tsx'),
  'utf8',
)
const GUIDE_PAGE = readFileSync(join(ROOT, 'src/app/guide/page.tsx'), 'utf8')
const GUIDE_SETTLEMENTS_PAGE = readFileSync(
  join(ROOT, 'src/app/guide/settlements/page.tsx'),
  'utf8',
)
const DASHBOARD_SELECTS = readFileSync(
  join(ROOT, 'src/lib/guide/dashboard-settlements.ts'),
  'utf8',
)
const GUIDE_CORRECTION_BANNER = readFileSync(
  join(ROOT, 'src/components/settlement/GuideCorrectionBanner.tsx'),
  'utf8',
)

const submitted = {
  status: 'submitted' as SettlementStatus,
  guide_confirmed_at: null,
  guide_submit_snapshot_id: 'snap-1',
}

const paid = {
  status: 'paid' as SettlementStatus,
  guide_confirmed_at: '2026-05-27T00:00:00Z',
  guide_submit_snapshot_id: 'snap-1',
}

const editRequested = {
  status: 'edit_requested' as SettlementStatus,
  guide_confirmed_at: null,
  guide_submit_snapshot_id: 'snap-1',
}

const pendingUnconfirmed = {
  status: 'pending_guide_confirmation' as SettlementStatus,
  guide_confirmed_at: null,
  guide_submit_snapshot_id: 'snap-1',
}

describe('admin correction request UI wiring', () => {
  it('ReviewPanel requires reason + section and encodes adminNote', () => {
    expect(REVIEW_PANEL).toContain('AdminCorrectionRequestFields')
    expect(REVIEW_PANEL).toContain('validateCorrectionRequestInput')
    expect(REVIEW_PANEL).toContain('encodeCorrectionNote')
    expect(REVIEW_PANEL).toContain("action: 'request_edit'")
    expect(REVIEW_PANEL).toContain('가이드 수정 요청')
  })

  it('admin edit SettlementForm shows request-edit button for submitted', () => {
    expect(SETTLEMENT_FORM).toContain('canAdminRequestEditOnSettlement')
    expect(SETTLEMENT_FORM).toContain('showRequestGuideCorrection')
    expect(SETTLEMENT_FORM_FOOTER).toContain('requestGuideCorrectionLabel')
    expect(SETTLEMENT_FORM_FOOTER).toContain('가이드 수정 요청')
    expect(canAdminRequestEditOnSettlement(submitted, 'admin')).toBe(true)
  })

  it('hides request edit for paid, edit_requested, pending_guide_confirmation', () => {
    expect(canAdminRequestEditOnSettlement(paid, 'admin')).toBe(false)
    expect(canAdminRequestEditOnSettlement(editRequested, 'admin')).toBe(false)
    expect(canAdminRequestEditOnSettlement(pendingUnconfirmed, 'admin')).toBe(false)
    expect(canAdminSendForConfirmation(paid.status, 'admin')).toBe(false)
    expect(canAdminSendForConfirmation(editRequested.status, 'admin')).toBe(false)
  })

  it('request_edit passes encoded adminNote through reviewSettlement', () => {
    const encoded = encodeCorrectionNote(['options'], '옵션 확인')
    expect(encoded).toContain('options')
    expect(SETTLEMENT_FORM).toContain("action: 'request_edit'")
    expect(SETTLEMENT_FORM).toContain('adminNote: encoded')
  })

  it('server-side request_edit rejects empty correction reason', () => {
    expect(ACTIONS).toContain('validateEncodedCorrectionNote')
    expect(validateEncodedCorrectionNote('').ok).toBe(false)
    expect(validateEncodedCorrectionNote(encodeCorrectionNote(['options'], '사유')).ok).toBe(true)
  })

  it('가이드 최종확인 요청 still calls sendForConfirmation with warning', () => {
    expect(SETTLEMENT_FORM).toContain('sendForConfirmation')
    expect(SETTLEMENT_FORM).toContain('SEND_FOR_CONFIRMATION_WARNING')
    expect(SETTLEMENT_FORM).toContain('가이드 최종확인 요청')
    expect(SETTLEMENT_FORM).not.toContain('가이드 검토 요청')
    expect(SETTLEMENT_FORM_FOOTER).toContain('가이드 최종확인 요청')
    expect(SETTLEMENT_FORM_FOOTER).not.toContain('가이드 검토 요청')
    expect(REVIEW_PANEL).toContain('sendForConfirmation')
    expect(REVIEW_PANEL).toContain('SEND_FOR_CONFIRMATION_WARNING')
    expect(REVIEW_PANEL).toContain('가이드 최종확인 요청')
    expect(REVIEW_PANEL).not.toContain('가이드 검토 요청')
    expect(SEND_FOR_CONFIRMATION_WARNING).toContain('가이드 최종확인 요청')
    expect(SEND_FOR_CONFIRMATION_WARNING).toContain('가이드 수정 요청')
  })
})

describe('guide correction visibility wiring', () => {
  it('guide edit shows correction banner for edit_requested', () => {
    expect(SETTLEMENT_FORM).toContain('GuideCorrectionBanner')
    expect(SETTLEMENT_FORM).toContain("settlementStatus === 'edit_requested'")
    expect(GUIDE_CORRECTION_BANNER).toContain('관리자 수정 요청')
  })

  it('does not show correction banner outside edit_requested', () => {
    expect(SETTLEMENT_FORM).toMatch(
      /guideCorrection\.reason && settlementStatus === 'edit_requested'/,
    )
  })

  it('highlights affected section headers, especially options', () => {
    expect(SETTLEMENT_FORM).toContain('needsAttention')
    expect(SETTLEMENT_FORM).toContain('getCorrectionSectionDefaultMessage')
    expect(SETTLEMENT_ACCORDION).toContain('확인 필요')
    expect(SETTLEMENT_ACCORDION).toContain('needsAttention')
    const parsed = parseCorrectionNote(
      encodeCorrectionNote(['options'], '옵션 항목이 누락되었습니다.'),
    )
    expect(parsed.sections).toContain('options')
  })

  it('auto-expands first affected section on guide edit', () => {
    expect(SETTLEMENT_FORM).toContain('correctionAutoExpanded')
    expect(SETTLEMENT_FORM).toContain('setOpenSectionId(guideCorrection.sections[0])')
  })

  it('dashboard and list show admin_note correction reason', () => {
    expect(DASHBOARD_SELECTS).toContain('admin_note')
    expect(GUIDE_PAGE).toContain('correctionReasonForDisplay')
    expect(GUIDE_PAGE).toContain("s.status === 'edit_requested'")
    expect(GUIDE_SETTLEMENTS_PAGE).toContain('correctionReasonForDisplay')
    expect(GUIDE_SETTLEMENTS_PAGE).toContain("s.status === 'edit_requested'")
  })

  it('legacy plain admin_note still has display reason', () => {
    const legacy = parseCorrectionNote('옵션 금액 확인 필요')
    expect(legacy.reason).toBe('옵션 금액 확인 필요')
    expect(legacy.sections).toEqual([])
  })
})

describe('unchanged flows regression guards', () => {
  it('guide confirm packet loader unchanged', () => {
    expect(ACTIONS).toContain('getGuideConfirmationPacket')
    expect(ACTIONS).toContain('filterGuideConfirmationChanges')
  })

  it('paid-lock guards unchanged in status-guards usage', () => {
    expect(canAdminRequestEditOnSettlement(paid, 'master_admin')).toBe(false)
  })
})
