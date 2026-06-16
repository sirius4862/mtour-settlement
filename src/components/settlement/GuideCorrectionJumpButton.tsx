'use client'

import { useCallback, useEffect, useRef } from 'react'
import {
  GUIDE_CORRECTION_JUMP_EVENT,
  correctionHashForSection,
  type GuideCorrectionJumpDetail,
  type GuideCorrectionJumpTargetPayload,
} from '@/lib/settlement/guide-correction-jump'

type Props = {
  settlementId: string
  targets: GuideCorrectionJumpTargetPayload[]
  anchorId: string
}

/**
 * Invisible client island — enhances a server-rendered anchor with jump event dispatch.
 * If hydration fails, the server anchor + hash fallback still work.
 */
export function GuideCorrectionJumpButton({ settlementId, targets, anchorId }: Props) {
  const jumpIndexRef = useRef(0)

  const dispatchJump = useCallback(
    (index: number) => {
      if (targets.length === 0) return
      const target = targets[index % targets.length]
      const detail: GuideCorrectionJumpDetail = {
        settlementId,
        section: target.section,
        targetIndex: index,
        rowId: target.rowId,
        clientId: target.clientId,
        rowLabel: target.rowLabel,
        kind: target.kind,
      }
      window.dispatchEvent(new CustomEvent(GUIDE_CORRECTION_JUMP_EVENT, { detail }))
      window.location.hash = correctionHashForSection(target.section)
    },
    [settlementId, targets],
  )

  useEffect(() => {
    const el = document.getElementById(anchorId)
    if (!el || targets.length === 0) return

    const onClick = (event: MouseEvent) => {
      event.preventDefault()
      const index = jumpIndexRef.current
      dispatchJump(index)
      jumpIndexRef.current = index + 1
    }

    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [anchorId, targets, dispatchJump])

  return null
}
