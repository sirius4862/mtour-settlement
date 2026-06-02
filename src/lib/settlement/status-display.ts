import { STATUS_META, type SettlementStatus } from '@/types'

/** Five workflow statuses shown on admin dashboard and filters. */
export const WORKFLOW_STATUS_ORDER: SettlementStatus[] = [
  'draft',
  'submitted',
  'pending_guide_confirmation',
  'edit_requested',
  'paid',
]

export interface SettlementStatusDisplay {
  label: string
  bg: string
  text: string
  /** Sub-state badge on 최종확인 when guide has confirmed (지급가능). */
  payReadyBadge?: string
}

function legacyStatusLabel(status: SettlementStatus): string | null {
  switch (status) {
    case 'approved':
      return '최종확인'
    case 'clarification_requested':
      return '수정요청'
    case 'rejected':
      return '수정요청'
    default:
      return null
  }
}

/** Admin-facing status label; maps deprecated DB values to the five-status model. */
export function getSettlementStatusDisplay(
  status: SettlementStatus,
  guideConfirmedAt?: string | null,
): SettlementStatusDisplay {
  const meta = STATUS_META[status]
  const legacy = legacyStatusLabel(status)
  const normalizedStatus =
    status === 'approved' || status === 'pending_guide_confirmation'
      ? 'pending_guide_confirmation'
      : status

  const payReady =
    (normalizedStatus === 'pending_guide_confirmation' || status === 'approved') &&
    guideConfirmedAt != null

  return {
    label: legacy ?? meta.label,
    bg: meta.bg,
    text: meta.text,
    payReadyBadge: payReady ? '지급가능' : undefined,
  }
}

export function isWorkflowStatus(status: SettlementStatus): boolean {
  return WORKFLOW_STATUS_ORDER.includes(status)
}
