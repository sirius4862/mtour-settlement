'use client'

import { receiptTargetLabel } from '@/lib/receipt/targets'
import type { ReceiptTarget } from '@/lib/receipt/types'
import { isReceiptEditable, useSettlementFormStore } from '@/lib/stores/settlementFormStore'
import { SectionCard } from '@/components/ui/FormPrimitives'
import { ReceiptUpload } from '@/components/receipt/ReceiptUpload'

function rowTitle(label: string, index: number): string {
  return label.trim() ? label : `#${index + 1}`
}

export function ReceiptsSection({ readOnly }: { readOnly?: boolean }) {
  const settlementId = useSettlementFormStore((s) => s.settlementId)
  const settlementStatus = useSettlementFormStore((s) => s.settlementStatus)
  const receipts = useSettlementFormStore((s) => s.receipts)
  const hotels = useSettlementFormStore((s) => s.hotels)
  const meals = useSettlementFormStore((s) => s.meals)
  const entrances = useSettlementFormStore((s) => s.entrances)
  const others = useSettlementFormStore((s) => s.others)
  const shoppings = useSettlementFormStore((s) => s.shoppings)
  const options = useSettlementFormStore((s) => s.options)

  const editable = !readOnly && isReceiptEditable({ settlementStatus })
  const disabledReason = !editable
    ? '제출·승인·지급된 정산서는 영수증을 수정할 수 없습니다.'
    : undefined

  const lineTargets: { title: string; target: ReceiptTarget }[] = []

  hotels.filter((r) => !r.deleted).forEach((row, i) => {
    lineTargets.push({
      title: rowTitle(row.hotel_name, i),
      target: { kind: 'hotel', rowId: row.id },
    })
  })
  meals.filter((r) => !r.deleted).forEach((row, i) => {
    lineTargets.push({
      title: rowTitle(row.restaurant_name, i),
      target: { kind: 'meal', rowId: row.id },
    })
  })
  entrances.filter((r) => !r.deleted).forEach((row, i) => {
    lineTargets.push({
      title: rowTitle(row.attraction_name, i),
      target: { kind: 'entrance', rowId: row.id },
    })
  })
  others.filter((r) => !r.deleted).forEach((row, i) => {
    lineTargets.push({
      title: rowTitle(row.description, i),
      target: { kind: 'other', rowId: row.id },
    })
  })
  shoppings.filter((r) => !r.deleted).forEach((row, i) => {
    lineTargets.push({
      title: rowTitle(row.shop_name, i),
      target: { kind: 'shopping', rowId: row.id },
    })
  })
  options.filter((r) => !r.deleted).forEach((row, i) => {
    lineTargets.push({
      title: rowTitle(row.option_name || (row.is_extra_vehicle ? '차량비(추가)' : ''), i),
      target: { kind: 'option', rowId: row.id },
    })
  })

  return (
    <div className="space-y-4">
      <SectionCard>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">정산서 전체</h3>
        <p className="text-xs text-gray-400 mb-3">
          투어 전체 영수증 · 총 {receipts.length}장
        </p>
        <ReceiptUpload
          settlementId={settlementId}
          target={{ kind: 'settlement' }}
          editable={editable}
          disabledReason={disabledReason}
        />
      </SectionCard>

      {lineTargets.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-800 px-1">항목별 영수증</h3>
          {lineTargets.map(({ title, target }) => (
            <SectionCard key={`${target.kind}-${target.rowId ?? title}`}>
              <p className="text-xs font-medium text-gray-600 mb-2">
                {receiptTargetLabel(target, title)}
              </p>
              <ReceiptUpload
                settlementId={settlementId}
                target={target}
                editable={editable}
                disabledReason={disabledReason}
                compact
              />
            </SectionCard>
          ))}
        </div>
      )}

      {lineTargets.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-2">
          항목을 추가하면 항목별 영수증을 첨부할 수 있습니다.
        </p>
      )}
    </div>
  )
}
