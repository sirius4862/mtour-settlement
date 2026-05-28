'use client'

import type { AnnotatedNumber } from '@/lib/settlement/types-calc'
import { MockBadge } from '@/components/ui/FormPrimitives'
import { SectionSubtotalPanel } from '../SectionSubtotal'

export function MockLineItemsSection({
  rowCount,
  phase = 'Phase 3',
  fields,
}: {
  rowCount: number
  phase?: string
  fields: AnnotatedNumber[]
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <MockBadge />
        <span className="text-xs text-gray-500">
          {rowCount}행 mock · {phase}에서 동적 행 UI
        </span>
      </div>
      <SectionSubtotalPanel fields={fields} />
    </div>
  )
}
