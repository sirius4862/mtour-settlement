import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  canAdminRequestEditOnSettlement,
  canAdminSendForConfirmation,
} from '@/lib/settlement/status-guards'
import {
  adminMemoInputValue,
  encodeCorrectionNote,
  encodeCorrectionNoteFromTargets,
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
const LINE_ITEM_SECTIONS = readFileSync(
  join(ROOT, 'src/components/settlement/sections/LineItemSections.tsx'),
  'utf8',
)
const CORRECTION_MODAL = readFileSync(
  join(ROOT, 'src/components/settlement/CorrectionRequestModal.tsx'),
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
const GUIDE_DETAIL_PAGE = readFileSync(
  join(ROOT, 'src/app/guide/settlements/[id]/page.tsx'),
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

describe('admin contextual correction UI wiring', () => {
  it('SettlementForm uses v2 encode and shared CorrectionRequestModal', () => {
    expect(SETTLEMENT_FORM).toContain('encodeCorrectionNoteFromTargets')
    expect(SETTLEMENT_FORM).toContain('CorrectionRequestModal')
    expect(SETTLEMENT_FORM).toContain('showSectionCorrectionAction')
    expect(SETTLEMENT_FORM).toContain('onSectionCorrectionRequest')
    expect(SETTLEMENT_FORM).toContain('기타 수정 요청')
    expect(SETTLEMENT_FORM).toContain("action: 'request_edit'")
  })

  it('accordion and line items expose contextual correction actions', () => {
    expect(SETTLEMENT_ACCORDION).toContain('CorrectionSectionAction')
    expect(SETTLEMENT_ACCORDION).toContain('onSectionCorrectionRequest')
    expect(LINE_ITEM_SECTIONS).toContain('LineItemCorrectionToolbar')
    expect(CORRECTION_MODAL).toContain('가이드 수정 요청')
    expect(CORRECTION_MODAL).toContain('preselectedRowLabel')
  })

  it('ReviewPanel uses compact footer actions and modal-only correction request', () => {
    expect(REVIEW_PANEL).toContain('CorrectionRequestModal')
    expect(REVIEW_PANEL).toContain('encodeCorrectionNoteFromTargets')
    expect(REVIEW_PANEL).toContain('기타 수정 요청')
    expect(REVIEW_PANEL).not.toContain('AdminCorrectionRequestFields')
    expect(REVIEW_PANEL).not.toContain('CORRECTION_SECTIONS.map')
    expect(REVIEW_PANEL).toContain('openGlobalCorrection')
    expect(REVIEW_PANEL).toContain('adminMemoInputValue')
  })

  it('admin edit keeps company sections and extra bottom padding for admin footer', () => {
    expect(SETTLEMENT_FORM).toContain("title: '회사 입력 항목'")
    expect(SETTLEMENT_FORM).toContain('showAdminSections')
    expect(SETTLEMENT_FORM).toContain('isAdminReview ? \'pb-52\' : \'pb-36\'')
    expect(SETTLEMENT_FORM_FOOTER).toContain('showRequestGuideCorrection')
    expect(SETTLEMENT_FORM_FOOTER).not.toContain('AdminCorrectionRequestFields')
  })

  it('ReviewPanel does not prefill memo with raw encoded correction metadata', () => {
    const v1 = encodeCorrectionNote(['options'], '옵션 누락')
    expect(adminMemoInputValue(v1)).toBe('')
    expect(REVIEW_PANEL).toContain('adminMemoInputValue(currentAdminNote)')
    expect(REVIEW_PANEL).toContain('correctionReasonForDisplay(currentAdminNote)')
    expect(REVIEW_PANEL).not.toContain('useState(currentAdminNote)')
  })

  it('admin edit SettlementForm still allows request edit for submitted', () => {
    expect(SETTLEMENT_FORM).toContain('canAdminRequestEditOnSettlement')
    expect(SETTLEMENT_FORM).toContain('showRequestGuideCorrection')
    expect(SETTLEMENT_FORM_FOOTER).toContain('requestGuideCorrectionLabel')
    expect(canAdminRequestEditOnSettlement(submitted, 'admin')).toBe(true)
  })

  it('hides request edit for paid, edit_requested, pending_guide_confirmation', () => {
    expect(canAdminRequestEditOnSettlement(paid, 'admin')).toBe(false)
    expect(canAdminRequestEditOnSettlement(editRequested, 'admin')).toBe(false)
    expect(canAdminRequestEditOnSettlement(pendingUnconfirmed, 'admin')).toBe(false)
    expect(canAdminSendForConfirmation(paid.status, 'admin')).toBe(false)
    expect(canAdminSendForConfirmation(editRequested.status, 'admin')).toBe(false)
  })

  it('server-side request_edit rejects empty correction reason', () => {
    expect(ACTIONS).toContain('validateEncodedCorrectionNote')
    expect(validateEncodedCorrectionNote('').ok).toBe(false)
    expect(
      validateEncodedCorrectionNote(
        encodeCorrectionNoteFromTargets([
          {
            section: 'options',
            kind: 'section',
            rowId: null,
            clientId: null,
            rowLabel: null,
            field: null,
            reason: '사유',
            proposed: null,
          },
        ]),
      ).ok,
    ).toBe(true)
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

describe('guide targeted correction visibility wiring', () => {
  it('guide edit shows compact correction banner with jump action', () => {
    expect(SETTLEMENT_FORM).toContain('GuideCorrectionBanner')
    expect(SETTLEMENT_FORM).toContain('isGuideEditRequested')
    expect(GUIDE_CORRECTION_BANNER).toContain('관리자 수정 요청')
    expect(GUIDE_CORRECTION_BANNER).toContain('문제 항목으로 이동')
    expect(GUIDE_CORRECTION_BANNER).toContain('수정 요청')
  })

  it('uses effective settlement status from initialFull when Zustand status is unset', () => {
    expect(SETTLEMENT_FORM).toContain('effectiveSettlementStatus')
    expect(SETTLEMENT_FORM).toContain('settlementStatus ?? initialFull?.status ?? null')
    expect(SETTLEMENT_FORM).toContain(
      "effectiveSettlementStatus === 'edit_requested'",
    )
    expect(SETTLEMENT_FORM).toMatch(
      /guideCorrection\.reason && isGuideEditRequested/,
    )
  })

  it('derives guide correction from initialFull admin_note before Zustand hydration', () => {
    expect(SETTLEMENT_FORM).toMatch(
      /if \(!isGuideEditRequested\)[\s\S]*parseCorrectionNote\(null\)/,
    )
    expect(SETTLEMENT_FORM).toContain('parseCorrectionNote(initialFull?.admin_note)')
    expect(SETTLEMENT_FORM).toContain('guideRowHighlights')
    expect(SETTLEMENT_FORM).toContain('guideCorrectionHighlight')
    expect(SETTLEMENT_FORM).not.toMatch(
      /guideCorrection[\s\S]*settlementStatus !== 'edit_requested'/,
    )
  })

  it('re-bootstraps edit mode when initialFull arrives instead of one-shot hydrated guard', () => {
    expect(SETTLEMENT_FORM).toContain('hydratedFromFullId')
    expect(SETTLEMENT_FORM).toContain('if (!initialFull) return')
    expect(SETTLEMENT_FORM).toContain('hydratedFromFullId.current === initialFull.id')
    expect(SETTLEMENT_FORM).not.toContain('hydrated.current')
  })

  it('does not show correction banner outside edit_requested', () => {
    expect(SETTLEMENT_FORM).toMatch(
      /guideCorrection\.reason && isGuideEditRequested/,
    )
    expect(SETTLEMENT_FORM).not.toMatch(
      /guideCorrection\.reason && settlementStatus === 'edit_requested'/,
    )
  })

  it('highlights affected sections and supports row-level highlight props', () => {
    expect(SETTLEMENT_FORM).toContain('needsAttention')
    expect(SETTLEMENT_FORM).toContain('sectionAttentionMessage')
    expect(SETTLEMENT_FORM).toContain('guideRowHighlights')
    expect(SETTLEMENT_FORM).toContain('handleJumpToCorrectionTarget')
    expect(SETTLEMENT_ACCORDION).toContain('확인 필요')
    expect(SETTLEMENT_ACCORDION).toContain('correction-section-')
    expect(LINE_ITEM_SECTIONS).toContain('LineItemCorrectionAlert')
  })

  it('auto-expands first affected section on guide edit', () => {
    expect(SETTLEMENT_FORM).toContain('correctionAutoExpanded')
    expect(SETTLEMENT_FORM).toContain('guideCorrection.targets[0]?.section')
  })

  it('v1 notes still parse for section highlight', () => {
    const parsed = parseCorrectionNote(
      encodeCorrectionNote(['options'], '옵션 항목이 누락되었습니다.'),
    )
    expect(parsed.sections).toContain('options')
    expect(parsed.targets).toHaveLength(1)
  })

  it('dashboard and list show admin_note correction reason', () => {
    expect(DASHBOARD_SELECTS).toContain('admin_note')
    expect(GUIDE_PAGE).toContain('correctionReasonForDisplay')
    expect(GUIDE_PAGE).toContain("s.status === 'edit_requested'")
    expect(GUIDE_SETTLEMENTS_PAGE).toContain('correctionReasonForDisplay')
    expect(GUIDE_SETTLEMENTS_PAGE).toContain("s.status === 'edit_requested'")
    expect(GUIDE_DETAIL_PAGE).toContain('correctionReasonForDisplay')
    expect(GUIDE_DETAIL_PAGE).not.toContain('whitespace-pre-wrap">{s.admin_note}')
  })

  it('legacy plain admin_note still has display reason for edit_requested guide edit', () => {
    const legacy = parseCorrectionNote('옵션 금액 확인 필요')
    expect(legacy.reason).toBe('옵션 금액 확인 필요')
    expect(legacy.sections).toEqual([])
    expect(adminMemoInputValue('옵션 금액 확인 필요')).toBe('옵션 금액 확인 필요')
    expect(SETTLEMENT_FORM).toContain('parseCorrectionNote(initialFull?.admin_note)')
  })

  it('v2 admin_note renders guide correction targets for jump/highlight', () => {
    const parsed = parseCorrectionNote(
      encodeCorrectionNoteFromTargets([
        {
          section: 'options',
          kind: 'amount_mismatch',
          rowId: null,
          clientId: null,
          rowLabel: '보트투어',
          field: 'unit_price_usd',
          reason: '보트투어 옵션 금액 확인 필요',
          proposed: null,
        },
      ]),
    )
    expect(parsed.reason).toContain('보트투어')
    expect(parsed.sections).toContain('options')
    expect(SETTLEMENT_FORM).toContain('handleJumpToCorrectionTarget')
    expect(GUIDE_CORRECTION_BANNER).toContain('문제 항목으로 이동')
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

  it('does not unlock guide-owned line item editing in admin review', () => {
    expect(LINE_ITEM_SECTIONS).toContain('disabled={adminReview}')
    expect(SETTLEMENT_FORM).not.toContain('mergeAdminOptionRowsForSave')
    expect(SETTLEMENT_FORM).not.toContain('sanitizeAdminDraftPayload')
  })
})
