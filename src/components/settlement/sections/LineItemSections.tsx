'use client'

import { ManualField } from '@/components/ui/FormPrimitives'
import {
  calcEntranceAmountVnd,
  calcHotelRow,
  calcMealAmountVnd,
  calcOptionRowComUsd,
  calcOptionTotalSaleUsd,
  calcOtherRowCombinedUsd,
  vndToUsd,
} from '@/lib/settlement/calc'
import { emptyOptionRow } from '@/lib/settlement/defaults'
import type { DraftHotelRow } from '@/lib/settlement/form-types'
import { useSettlementFormStore } from '@/lib/stores/settlementFormStore'
import { DynamicRowList, parseNum, RowActions } from '../rows/DynamicRowList'
import { CalculatedField } from '../CalculatedField'
import { ItemWithReceipt } from '@/components/receipt/ItemWithReceipt'
import { SectionHint } from '../SectionHint'
import { EXCEL_SECTIONS } from '@/lib/settlement/excel-sections'
import {
  canAddExtraVehicle,
  canAddHotelRows,
  canEditExtraVehicle,
} from '@/lib/settlement/field-ownership'
import { useSettlementFormRole, useAdminReviewEdit } from '../SettlementFormContext'

export function HotelsSection() {
  const role = useSettlementFormRole()
  const adminReview = useAdminReviewEdit()
  const isAdmin = role === 'admin'
  const guideFieldsLocked = adminReview
  const hotels = useSettlementFormStore((s) => s.hotels)
  const updateRow = useSettlementFormStore((s) => s.updateRow)
  const addRow = useSettlementFormStore((s) => s.addRow)
  const duplicateRow = useSettlementFormStore((s) => s.duplicateRow)
  const softDeleteRow = useSettlementFormStore((s) => s.softDeleteRow)

  return (
    <div className="space-y-3">
      <SectionHint excelRows={EXCEL_SECTIONS.hotels.rows} hint={EXCEL_SECTIONS.hotels.hint} />
      <DynamicRowList
      rows={hotels}
      onAdd={() => addRow('hotels')}
      hideAdd={!canAddHotelRows(role)}
      addLabel="+ 호텔 추가"
      renderRow={(row: DraftHotelRow) => {
        const calc = calcHotelRow(row)
        return (
          <>
            <ManualField label="호텔명" value={row.hotel_name} disabled={guideFieldsLocked}
              onChange={(e) => updateRow('hotels', row.clientId, { hotel_name: e.target.value })} />
            <ManualField label="체크인" type="date" value={row.check_in_date ?? ''} disabled={guideFieldsLocked}
              onChange={(e) => updateRow('hotels', row.clientId, { check_in_date: e.target.value || null })} />
            <div className="grid grid-cols-2 gap-2">
              <ManualField label="박수" excelRef="E8" inputMode="decimal" value={row.nights || ''} disabled={guideFieldsLocked}
                onChange={(e) => updateRow('hotels', row.clientId, { nights: parseNum(e.target.value) })} />
              <ManualField label="SGL" excelRef="F8" inputMode="decimal" value={row.sgl_count || ''} disabled={guideFieldsLocked}
                onChange={(e) => updateRow('hotels', row.clientId, { sgl_count: parseNum(e.target.value) })} />
              <ManualField label="TWN" excelRef="H8" inputMode="decimal" value={row.twn_count || ''} disabled={guideFieldsLocked}
                onChange={(e) => updateRow('hotels', row.clientId, { twn_count: parseNum(e.target.value) })} />
              <ManualField label="TRP" excelRef="J8" inputMode="decimal" value={row.trp_count || ''} disabled={guideFieldsLocked}
                onChange={(e) => updateRow('hotels', row.clientId, { trp_count: parseNum(e.target.value) })} />
            </div>
            {isAdmin && (
              <div className="grid grid-cols-2 gap-2">
                <ManualField label="단가 SGL/TWN" excelRef="M8" suffix="$" inputMode="decimal"
                  value={row.unit_price_sgl_usd || ''}
                  onChange={(e) => updateRow('hotels', row.clientId, { unit_price_sgl_usd: parseNum(e.target.value) })} />
                <ManualField label="단가 TRP" excelRef="O8" suffix="$" inputMode="decimal"
                  value={row.unit_price_trp_usd || ''}
                  onChange={(e) => updateRow('hotels', row.clientId, { unit_price_trp_usd: parseNum(e.target.value) })} />
              </div>
            )}
            {isAdmin && <CalculatedField field={calc.company_amount_usd} compact />}
            <ManualField label="가이드결재" excelRef="R8" suffix="$" inputMode="decimal"
              value={row.guide_amount_usd || ''} disabled={guideFieldsLocked}
              onChange={(e) => updateRow('hotels', row.clientId, { guide_amount_usd: parseNum(e.target.value) })} />
            {!guideFieldsLocked && (
            <RowActions
              onDuplicate={() => duplicateRow('hotels', row.clientId)}
              onDelete={() => softDeleteRow('hotels', row.clientId)}
            />
            )}
            <ItemWithReceipt
              target={{ kind: 'hotel', rowId: row.id }}
              rowLabel={row.hotel_name || undefined}
            />
          </>
        )
      }}
    />
    </div>
  )
}

export function MealsSection() {
  const adminReview = useAdminReviewEdit()
  const meals = useSettlementFormStore((s) => s.meals)
  const rate = useSettlementFormStore((s) => s.exchange_rate)
  const updateRow = useSettlementFormStore((s) => s.updateRow)
  const addRow = useSettlementFormStore((s) => s.addRow)
  const duplicateRow = useSettlementFormStore((s) => s.duplicateRow)
  const softDeleteRow = useSettlementFormStore((s) => s.softDeleteRow)

  return (
    <div className="space-y-3">
      <SectionHint excelRows={EXCEL_SECTIONS.meals.rows} hint={EXCEL_SECTIONS.meals.hint} />
      <DynamicRowList
      rows={meals}
      onAdd={() => addRow('meals')}
      hideAdd={adminReview}
      addLabel="+ 식사 추가"
      renderRow={(row) => {
        const amount = calcMealAmountVnd(row)
        return (
          <>
            <ManualField label="날짜" type="date" value={row.meal_date ?? ''} disabled={adminReview}
              onChange={(e) => updateRow('meals', row.clientId, { meal_date: e.target.value || null })} />
            <ManualField label="식당명" value={row.restaurant_name} disabled={adminReview}
              onChange={(e) => updateRow('meals', row.clientId, { restaurant_name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <ManualField label="인원" excelRef="E15" inputMode="decimal" value={row.pax || ''} disabled={adminReview}
                onChange={(e) => updateRow('meals', row.clientId, { pax: parseNum(e.target.value) })} />
              <ManualField label="단가(VND)" excelRef="F15" suffix="₫" inputMode="decimal"
                value={row.unit_price_vnd || ''} disabled={adminReview}
                onChange={(e) => updateRow('meals', row.clientId, { unit_price_vnd: parseNum(e.target.value) })} />
            </div>
            <CalculatedField
              field={{ value: amount, label: '금액(VND)', excelRef: 'H15', formula: 'E15×F15' }}
              currency="vnd"
              compact
            />
            {rate > 0 && (
              <p className="text-[11px] text-gray-400 text-right font-mono">
                ≈ ${vndToUsd(amount, rate).toFixed(2)}
              </p>
            )}
            {!adminReview && (
            <RowActions
              onDuplicate={() => duplicateRow('meals', row.clientId)}
              onDelete={() => softDeleteRow('meals', row.clientId)}
            />
            )}
            <ItemWithReceipt
              target={{ kind: 'meal', rowId: row.id }}
              rowLabel={row.restaurant_name || undefined}
            />
          </>
        )
      }}
    />
    </div>
  )
}

export function EntrancesSection() {
  const adminReview = useAdminReviewEdit()
  const entrances = useSettlementFormStore((s) => s.entrances)
  const updateRow = useSettlementFormStore((s) => s.updateRow)
  const addRow = useSettlementFormStore((s) => s.addRow)
  const duplicateRow = useSettlementFormStore((s) => s.duplicateRow)
  const softDeleteRow = useSettlementFormStore((s) => s.softDeleteRow)

  return (
    <div className="space-y-3">
      <SectionHint excelRows={EXCEL_SECTIONS.entrances.rows} hint={EXCEL_SECTIONS.entrances.hint} />
      <DynamicRowList
      rows={entrances}
      onAdd={() => addRow('entrances')}
      hideAdd={adminReview}
      addLabel="+ 입장료 추가"
      renderRow={(row) => {
        const amount = calcEntranceAmountVnd(row)
        return (
          <>
            <ManualField label="날짜" type="date" value={row.visit_date ?? ''} disabled={adminReview}
              onChange={(e) => updateRow('entrances', row.clientId, { visit_date: e.target.value || null })} />
            <ManualField label="내역" value={row.attraction_name} disabled={adminReview}
              onChange={(e) => updateRow('entrances', row.clientId, { attraction_name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <ManualField label="인원" excelRef="E28" inputMode="decimal" value={row.pax || ''} disabled={adminReview}
                onChange={(e) => updateRow('entrances', row.clientId, { pax: parseNum(e.target.value) })} />
              <ManualField label="단가(VND)" excelRef="F28" suffix="₫" inputMode="decimal" value={row.unit_price_vnd || ''} disabled={adminReview}
                onChange={(e) => updateRow('entrances', row.clientId, { unit_price_vnd: parseNum(e.target.value) })} />
            </div>
            <CalculatedField
              field={{ value: amount, label: '금액(VND)', excelRef: 'H28', formula: 'E28×F28' }}
              currency="vnd"
              compact
            />
            {!adminReview && (
            <RowActions
              onDuplicate={() => duplicateRow('entrances', row.clientId)}
              onDelete={() => softDeleteRow('entrances', row.clientId)}
            />
            )}
            <ItemWithReceipt
              target={{ kind: 'entrance', rowId: row.id }}
              rowLabel={row.attraction_name || undefined}
            />
          </>
        )
      }}
    />
    </div>
  )
}

export function OthersSection() {
  const adminReview = useAdminReviewEdit()
  const others = useSettlementFormStore((s) => s.others)
  const rate = useSettlementFormStore((s) => s.exchange_rate)
  const updateRow = useSettlementFormStore((s) => s.updateRow)
  const addRow = useSettlementFormStore((s) => s.addRow)
  const duplicateRow = useSettlementFormStore((s) => s.duplicateRow)
  const softDeleteRow = useSettlementFormStore((s) => s.softDeleteRow)

  return (
    <div className="space-y-3">
      <SectionHint excelRows={EXCEL_SECTIONS.others.rows} hint={EXCEL_SECTIONS.others.hint} />
      <DynamicRowList
      rows={others}
      onAdd={() => addRow('others')}
      hideAdd={adminReview}
      addLabel="+ 지출 추가"
      renderRow={(row) => {
        const combinedUsd = calcOtherRowCombinedUsd(row, rate)
        return (
          <>
            <ManualField label="지출 항목" value={row.description} disabled={adminReview}
              onChange={(e) => updateRow('others', row.clientId, { description: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <ManualField label="USD 금액" suffix="$" inputMode="decimal"
                value={row.amount_usd || ''} disabled={adminReview}
                onChange={(e) => updateRow('others', row.clientId, { amount_usd: parseNum(e.target.value) })} />
              <ManualField label="VND 금액" suffix="₫" inputMode="decimal"
                value={row.amount_vnd || ''} disabled={adminReview}
                onChange={(e) => updateRow('others', row.clientId, { amount_vnd: parseNum(e.target.value) })} />
            </div>
            <ManualField label="메모 (선택)" value={row.note ?? ''} disabled={adminReview}
              onChange={(e) => updateRow('others', row.clientId, { note: e.target.value || null })} />
            {(row.amount_usd > 0 || row.amount_vnd > 0) && (
              <CalculatedField
                field={{
                  value: combinedUsd,
                  label: '환산 합계',
                  excelRef: 'J53',
                  formula: 'USD + ₫/Q2',
                }}
                compact
              />
            )}
            {!adminReview && (
            <RowActions
              onDuplicate={() => duplicateRow('others', row.clientId)}
              onDelete={() => softDeleteRow('others', row.clientId)}
            />
            )}
            <ItemWithReceipt
              target={{ kind: 'other', rowId: row.id }}
              rowLabel={row.description || undefined}
            />
          </>
        )
      }}
    />
    </div>
  )
}

export function ShoppingSection() {
  const role = useSettlementFormRole()
  const adminReview = useAdminReviewEdit()
  const isAdmin = role === 'admin'
  const shoppings = useSettlementFormStore((s) => s.shoppings)
  const updateRow = useSettlementFormStore((s) => s.updateRow)
  const addRow = useSettlementFormStore((s) => s.addRow)
  const duplicateRow = useSettlementFormStore((s) => s.duplicateRow)
  const softDeleteRow = useSettlementFormStore((s) => s.softDeleteRow)

  return (
    <div className="space-y-3">
      <SectionHint excelRows={EXCEL_SECTIONS.shopping.rows} hint={EXCEL_SECTIONS.shopping.hint} />
      <DynamicRowList
      rows={shoppings}
      onAdd={() => addRow('shoppings')}
      hideAdd={adminReview}
      addLabel="+ 쇼핑 추가"
      renderRow={(row) => (
        <>
          <ManualField label="날짜" type="date" value={row.visit_date ?? ''} disabled={adminReview}
            onChange={(e) => updateRow('shoppings', row.clientId, { visit_date: e.target.value || null })} />
          <ManualField label="샵명" value={row.shop_name} disabled={adminReview}
            onChange={(e) => updateRow('shoppings', row.clientId, { shop_name: e.target.value })} />
          <div className={`grid gap-2 ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <ManualField label="SALE (참고)" excelRef="D57" suffix="$" inputMode="decimal" value={row.sale_usd || ''} disabled={adminReview}
              onChange={(e) => updateRow('shoppings', row.clientId, { sale_usd: parseNum(e.target.value) })} />
            <ManualField label="COM (수익)" excelRef="F57" suffix="$" inputMode="decimal" value={row.com_usd || ''} disabled={adminReview}
              onChange={(e) => updateRow('shoppings', row.clientId, { com_usd: parseNum(e.target.value) })} />
            {isAdmin && (
              <ManualField label="KB (회사 전용 수익)" excelRef="H57" suffix="$" inputMode="decimal" value={row.kb_usd || ''}
                onChange={(e) => updateRow('shoppings', row.clientId, { kb_usd: parseNum(e.target.value) })} />
            )}
          </div>
          {!adminReview && (
          <RowActions
            onDuplicate={() => duplicateRow('shoppings', row.clientId)}
            onDelete={() => softDeleteRow('shoppings', row.clientId)}
          />
          )}
          <ItemWithReceipt
            target={{ kind: 'shopping', rowId: row.id }}
            rowLabel={row.shop_name || undefined}
          />
        </>
      )}
    />
    </div>
  )
}

export function OptionsSection() {
  const role = useSettlementFormRole()
  const adminReview = useAdminReviewEdit()
  const isAdmin = role === 'admin'
  const extraVehicleEditable = canEditExtraVehicle(role)
  const canAddExtra = canAddExtraVehicle(role)
  const options = useSettlementFormStore((s) => s.options)
  const rate = useSettlementFormStore((s) => s.exchange_rate)
  const updateRow = useSettlementFormStore((s) => s.updateRow)
  const addRow = useSettlementFormStore((s) => s.addRow)
  const duplicateRow = useSettlementFormStore((s) => s.duplicateRow)
  const softDeleteRow = useSettlementFormStore((s) => s.softDeleteRow)

  const addExtraVehicle = () => {
    useSettlementFormStore.setState((s) => ({
      options: [...s.options, emptyOptionRow(true)],
      dirty: true,
    }))
  }

  return (
    <div className="space-y-3">
      <SectionHint excelRows={EXCEL_SECTIONS.options.rows} hint={EXCEL_SECTIONS.options.hint} />
      <DynamicRowList
        rows={options.filter((row) => isAdmin || !row.is_extra_vehicle)}
        onAdd={() => addRow('options')}
        hideAdd={adminReview}
        addLabel="+ 옵션 추가"
        renderRow={(row) => {
          if (row.is_extra_vehicle) {
            return (
              <>
                <p className="text-sm font-medium text-gray-700">🚌 차량비(추가) · R71</p>
                <div className="grid grid-cols-2 gap-2">
                  <ManualField label="지출($)" excelRef="P71" suffix="$" inputMode="decimal" value={row.expense_usd || ''}
                    disabled={!extraVehicleEditable}
                    onChange={(e) => updateRow('options', row.clientId, { expense_usd: parseNum(e.target.value) })} />
                  <ManualField label="지출(₫)" excelRef="Q71" suffix="₫" inputMode="decimal" value={row.expense_vnd || ''}
                    disabled={!extraVehicleEditable}
                    onChange={(e) => updateRow('options', row.clientId, { expense_vnd: parseNum(e.target.value) })} />
                </div>
                {extraVehicleEditable && (
                  <RowActions
                    onDuplicate={() => duplicateRow('options', row.clientId)}
                    onDelete={() => softDeleteRow('options', row.clientId)}
                  />
                )}
                <ItemWithReceipt
                  target={{ kind: 'option', rowId: row.id }}
                  rowLabel="차량비(추가)"
                />
              </>
            )
          }
          const total = calcOptionTotalSaleUsd(row)
          const com = calcOptionRowComUsd(row, rate)
          return (
            <>
              <ManualField label="날짜" type="date" value={row.option_date ?? ''} disabled={adminReview}
                onChange={(e) => updateRow('options', row.clientId, { option_date: e.target.value || null })} />
              <ManualField label="옵션명" value={row.option_name} disabled={adminReview}
                onChange={(e) => updateRow('options', row.clientId, { option_name: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <ManualField label="판매단가" excelRef="M57" suffix="$" inputMode="decimal"
                  value={row.unit_price_usd || ''} disabled={adminReview}
                  onChange={(e) => updateRow('options', row.clientId, { unit_price_usd: parseNum(e.target.value) })} />
                <ManualField label="인원" excelRef="N57" inputMode="decimal" value={row.pax || ''} disabled={adminReview}
                  onChange={(e) => updateRow('options', row.clientId, { pax: parseNum(e.target.value) })} />
              </div>
              <CalculatedField field={{ value: total, label: '판매총액', excelRef: 'O57', formula: 'M57×N57' }} compact />
              <div className="grid grid-cols-2 gap-2">
                <ManualField label="지출($)" excelRef="P57" suffix="$" inputMode="decimal" value={row.expense_usd || ''} disabled={adminReview}
                  onChange={(e) => updateRow('options', row.clientId, { expense_usd: parseNum(e.target.value) })} />
                <ManualField label="지출(₫)" excelRef="Q57" suffix="₫" inputMode="decimal" value={row.expense_vnd || ''} disabled={adminReview}
                  onChange={(e) => updateRow('options', row.clientId, { expense_vnd: parseNum(e.target.value) })} />
              </div>
              <CalculatedField field={{ value: com, label: 'COM', excelRef: 'S57', formula: 'O57−P57−Q57/Q2' }} compact />
              {!adminReview && (
              <RowActions
                onDuplicate={() => duplicateRow('options', row.clientId)}
                onDelete={() => softDeleteRow('options', row.clientId)}
              />
              )}
              <ItemWithReceipt
                target={{ kind: 'option', rowId: row.id }}
                rowLabel={row.option_name || undefined}
              />
            </>
          )
        }}
      />
      {canAddExtra && (
        <button
          type="button"
          onClick={addExtraVehicle}
          className="w-full min-h-11 text-xs font-medium text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-50"
        >
          + 추가차량비 (R71)
        </button>
      )}
    </div>
  )
}
