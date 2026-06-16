import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  canAdminSendForConfirmation,
  canAdminSendForConfirmationOnSettlement,
} from '@/lib/settlement/status-guards'
import type { SettlementStatus } from '@/types'

const ROOT = process.cwd()
const SETTLEMENT_FORM = readFileSync(
  join(ROOT, 'src/components/settlement/SettlementForm.tsx'),
  'utf8',
)
const SETTLEMENT_FORM_FOOTER = readFileSync(
  join(ROOT, 'src/components/settlement/SettlementFormFooter.tsx'),
  'utf8',
)
const REVIEW_PANEL = readFileSync(
  join(ROOT, 'src/app/admin/settlements/[id]/ReviewPanel.tsx'),
  'utf8',
)
const ACTIONS = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')

const eligible = {
  status: 'submitted' as SettlementStatus,
  guide_submit_snapshot_id: 'snap-1',
}

describe('admin edit footer send-to-guide action', () => {
  it('shows 임시저장 on admin edit footer', () => {
    expect(SETTLEMENT_FORM).toContain('saveLabel="임시저장"')
    expect(SETTLEMENT_FORM_FOOTER).toContain('saveLabel = \'임시저장\'')
    expect(SETTLEMENT_FORM).toContain('hideSubmit={isAdminReview}')
  })

  it('shows 저장 후 가이드 최종확인 요청 only when status guard allows', () => {
    expect(SETTLEMENT_FORM).toContain('adminWorkflowSource')
    expect(SETTLEMENT_FORM).toContain('canAdminSendForConfirmationOnSettlement')
    expect(SETTLEMENT_FORM).toContain('showSendForConfirmation={canSendForConfirmation}')
    expect(SETTLEMENT_FORM).toContain('sendForConfirmationLabel="저장 후 가이드 최종확인 요청"')
    expect(canAdminSendForConfirmationOnSettlement(eligible, 'admin')).toBe(true)
    expect(
      canAdminSendForConfirmationOnSettlement(
        { status: 'clarification_requested', guide_submit_snapshot_id: 'snap-1' },
        'admin',
      ),
    ).toBe(true)
    expect(
      canAdminSendForConfirmationOnSettlement(
        { status: 'pending_guide_confirmation', guide_submit_snapshot_id: 'snap-1' },
        'admin',
      ),
    ).toBe(false)
    expect(
      canAdminSendForConfirmationOnSettlement(
        { status: 'submitted', guide_submit_snapshot_id: null },
        'admin',
      ),
    ).toBe(false)
  })

  it('prefers initialFull workflow fields on existing admin edit pages', () => {
    expect(SETTLEMENT_FORM).toMatch(
      /isExistingSettlementEdit[\s\S]*initialFull\?\.status \?\? settlementStatus/,
    )
    expect(SETTLEMENT_FORM).toMatch(
      /isExistingSettlementEdit[\s\S]*initialFull\?\.guide_submit_snapshot_id \?\? guideSubmitSnapshotId/,
    )
  })

  it('handleSendForConfirmation saves before calling sendForConfirmation', () => {
    expect(SETTLEMENT_FORM).toMatch(
      /handleSendForConfirmation[\s\S]*const saved = await handleSave\(\)[\s\S]*sendForConfirmation\(id\)/,
    )
  })

  it('does not call sendForConfirmation when save fails', () => {
    expect(SETTLEMENT_FORM).toMatch(
      /const saved = await handleSave\(\)[\s\S]*if \(!saved\.ok\) return[\s\S]*sendForConfirmation\(id\)/,
    )
  })

  it('surfaces workflow failure without navigating away', () => {
    expect(SETTLEMENT_FORM).toMatch(
      /sendForConfirmation\(id\)[\s\S]*if \(result\.ok\)[\s\S]*router\.push\(adminEdit\.backHref\)/,
    )
    expect(SETTLEMENT_FORM).toMatch(
      /sendForConfirmation\(id\)[\s\S]*setSaveError\(result\.error \?\? '가이드 최종확인 요청 실패'\)/,
    )
  })

  it('does not navigate on workflow failure', () => {
    expect(SETTLEMENT_FORM).toMatch(
      /if \(result\.ok\) \{[\s\S]*router\.push\(adminEdit\.backHref\)/,
    )
    expect(SETTLEMENT_FORM).toMatch(
      /setSaveError\(result\.error \?\? '가이드 최종확인 요청 실패'\)/,
    )
    expect(SETTLEMENT_FORM).toContain("setPendingAction('send')")
    expect(SETTLEMENT_FORM).toContain('setPendingAction(null)')
  })

  it('keeps existing 임시저장 path unchanged', () => {
    expect(SETTLEMENT_FORM).toContain('onSave={handleSave}')
    expect(SETTLEMENT_FORM).toContain("setPendingAction('save')")
    expect(SETTLEMENT_FORM).toContain('managePending !== false')
  })

  it('detail page guide-final-confirmation button still uses sendForConfirmation', () => {
    expect(REVIEW_PANEL).toContain('sendForConfirmation')
    expect(REVIEW_PANEL).toContain('가이드 최종확인 요청')
    expect(REVIEW_PANEL).not.toContain('저장 후 가이드 최종확인 요청')
    expect(ACTIONS).toContain('export async function sendForConfirmation')
  })

  it('status guard blocks disallowed statuses', () => {
    const blocked: SettlementStatus[] = [
      'draft',
      'edit_requested',
      'pending_guide_confirmation',
      'approved',
      'paid',
      'rejected',
    ]
    for (const status of blocked) {
      expect(canAdminSendForConfirmation(status, 'admin')).toBe(false)
      expect(
        canAdminSendForConfirmationOnSettlement(
          { status, guide_submit_snapshot_id: 'snap-1' },
          'admin',
        ),
      ).toBe(false)
    }
  })
})
