'use client'

import { useCallback, useMemo, useState } from 'react'
import type { SettlementStatus } from '@/types'
import {
  emptyCorrectionTarget,
  parseCorrectionNote,
} from '@/lib/settlement/correction-request-meta'
import {
  GUIDE_CORRECTION_JUMP_EVENT,
  correctionHashForSection,
  type GuideCorrectionJumpDetail,
} from '@/lib/settlement/guide-correction-jump'
import { GuideCorrectionBanner } from './GuideCorrectionBanner'

type Props = {
  settlementId: string
  status: SettlementStatus
  adminNote: string | null
}

/** SSR-stable guide correction notice — server props only, no client store. */
export function GuideCorrectionStableShell({ settlementId, status, adminNote }: Props) {
  const correction = useMemo(
    () => (status === 'edit_requested' ? parseCorrectionNote(adminNote) : parseCorrectionNote(null)),
    [status, adminNote],
  )
  const [jumpIndex, setJumpIndex] = useState(0)

  const handleJump = useCallback(() => {
    if (!correction.reason.trim()) return

    const jumpTargets =
      correction.targets.length > 0
        ? correction.targets
        : correction.sections.map((section) =>
            emptyCorrectionTarget(section, {
              kind: 'section',
              reason: correction.reason,
            }),
          )
    if (jumpTargets.length === 0) return

    const target = jumpTargets[jumpIndex % jumpTargets.length]
    const detail: GuideCorrectionJumpDetail = {
      settlementId,
      section: target.section,
      targetIndex: jumpIndex,
      rowId: target.rowId,
      clientId: target.clientId,
      rowLabel: target.rowLabel,
      kind: target.kind,
    }
    setJumpIndex((i) => i + 1)
    window.dispatchEvent(new CustomEvent(GUIDE_CORRECTION_JUMP_EVENT, { detail }))
    window.location.hash = correctionHashForSection(target.section)
  }, [correction, jumpIndex, settlementId])

  if (status !== 'edit_requested' || !correction.reason.trim()) {
    return null
  }

  return (
    <div className="px-4 pt-4" data-guide-correction-shell="true">
      <GuideCorrectionBanner correction={correction} onJumpToTarget={handleJump} />
    </div>
  )
}
