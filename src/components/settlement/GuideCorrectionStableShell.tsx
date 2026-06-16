import type { SettlementStatus } from '@/types'
import {
  emptyCorrectionTarget,
  getCorrectionSectionLabel,
  parseCorrectionNote,
  type CorrectionTarget,
} from '@/lib/settlement/correction-request-meta'
import {
  correctionHashForSection,
  type GuideCorrectionJumpTargetPayload,
} from '@/lib/settlement/guide-correction-jump'
import { GuideCorrectionJumpButton } from './GuideCorrectionJumpButton'

const JUMP_ANCHOR_ID = 'guide-correction-jump'

type Props = {
  settlementId: string
  status: SettlementStatus
  adminNote: string | null
}

function jumpTargetsFromCorrection(
  correction: ReturnType<typeof parseCorrectionNote>,
): CorrectionTarget[] {
  if (correction.targets.length > 0) return correction.targets
  if (!correction.reason.trim()) return []
  return correction.sections.map((section) =>
    emptyCorrectionTarget(section, {
      kind: 'section',
      reason: correction.reason,
    }),
  )
}

function serializeJumpTargets(targets: CorrectionTarget[]): GuideCorrectionJumpTargetPayload[] {
  return targets.map((target) => ({
    section: target.section,
    kind: target.kind,
    rowId: target.rowId,
    clientId: target.clientId,
    rowLabel: target.rowLabel,
  }))
}

/** Server-rendered guide correction notice — survives client hydration recovery. */
export function GuideCorrectionStableShell({ settlementId, status, adminNote }: Props) {
  const correction =
    status === 'edit_requested' ? parseCorrectionNote(adminNote) : parseCorrectionNote(null)

  if (status !== 'edit_requested' || !correction.reason.trim()) {
    return null
  }

  const jumpTargets = jumpTargetsFromCorrection(correction)
  const targetCount = correction.targets.length || correction.sections.length
  const sectionLabels = correction.sections.map((id) => getCorrectionSectionLabel(id))
  const reasonSnippet =
    correction.targets.length > 0 ? correction.targets[0].reason : correction.reason
  const firstSection = jumpTargets[0]?.section ?? correction.sections[0]
  const fallbackHash = firstSection ? correctionHashForSection(firstSection) : null

  return (
    <div className="px-4 pt-4" data-guide-correction-shell="true">
      <div
        className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 mb-4"
        role="alert"
        data-guide-correction-banner="true"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-red-800">관리자 수정 요청</p>
            {targetCount > 0 && (
              <p className="text-xs text-red-700 mt-0.5">
                수정 요청 {targetCount}건
                {sectionLabels.length > 0 && ` · ${sectionLabels.join(', ')}`}
              </p>
            )}
            <p className="text-xs text-red-700 mt-1 line-clamp-2">{reasonSnippet}</p>
          </div>
          {targetCount > 0 && fallbackHash && (
            <a
              id={JUMP_ANCHOR_ID}
              href={`#${fallbackHash}`}
              className="shrink-0 px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-semibold hover:bg-red-700 no-underline"
              data-guide-correction-jump="true"
            >
              문제 항목으로 이동
            </a>
          )}
        </div>
      </div>
      {jumpTargets.length > 0 && (
        <GuideCorrectionJumpButton
          settlementId={settlementId}
          targets={serializeJumpTargets(jumpTargets)}
          anchorId={JUMP_ANCHOR_ID}
        />
      )}
    </div>
  )
}
