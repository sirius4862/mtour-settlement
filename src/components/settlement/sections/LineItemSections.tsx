'use client'

import { ManualField } from '@/components/ui/FormPrimitives'
import {
  calcEntranceAmountVnd,
  calcHotelRow,
  calcMealAmountVnd,
  calcOptionRowComUsd,
  calcOptionTotalSaleUsd,
  calcOtherAmountUsd,
  calcOtherAmountVnd,
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

export function HotelsSection() {
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
      addLabel="+ 호텔 추가"
      renderRow={(row: DraftHotelRow) => {
        const calc = calcHotelRow(row)
        return (
          <>
            <ManualField label="호텔명" value={row.hotel_name}
              onChange={(e) => updateRow('hotels', row.clientId, { hotel_name: e.target.value })} />
            <ManualField label="체크인" type="date" value={row.check_in_date ?? ''}
              onChange={(e) => updateRow('hotels', row.clientId, { check_in_date: e.target.value || null })} />
            <div className="grid grid-cols-2 gap-2">
              <ManualField label="박수" excelRef="E8" inputMode="decimal" value={row.nights || ''}
                onChange={(e) => updateRow('hotels', row.clientId, { nights: parseNum(e.target.value) })} />
              <ManualField label="SGL" excelRef="F8" inputMode="decimal" value={row.sgl_count || ''}
                onChange={(e) => updateRow('hotels', row.clientId, { sgl_count: parseNum(e.target.value) })} />
              <ManualField label="TWN" excelRef="H8" inputMode="decimal" value={row.twn_count || ''}
                onChange={(e) => updateRow('hotels', row.clientId, { twn_count: parseNum(e.target.value) })} />
              <ManualField label="TRP" excelRef="J8" inputMode="decimal" value={row.trp_count || ''}
                onChange={(e) => updateRow('hotels', row.clientId, { trp_count: parseNum(e.target.value) })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ManualField label="단가 SGL/TWN" excelRef="M8" suffix="$" inputMode="decimal"
                value={row.unit_price_sgl_usd || ''}
                onChange={(e) => updateRow('hotels', row.clientId, { unit_price_sgl_usd: parseNum(e.target.value) })} />
              <ManualField label="단가 TRP" excelRef="O8" suffix="$" inputMode="decimal"
                value={row.unit_price_trp_usd || ''}
                onChange={(e) => updateRow('hotels', row.clientId, { unit_price_trp_usd: parseNum(e.target.value) })} />
            </div>
            <CalculatedField field={calc.company_amount_usd} compact />
            <ManualField label="가이드결재" excelRef="R8" suffix="$" inputMode="decimal"
              value={row.guide_amount_usd || ''}
              onChange={(e) => updateRow('hotels', row.clientId, { guide_amount_usd: parseNum(e.target.value) })} />
            <RowActions
              onDuplicate={() => duplicateRow('hotels', row.clientId)}
              onDelete={() => softDeleteRow('hotels', row.clientId)}
            />
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
      addLabel="+ 식사 추가"
      renderRow={(row) => {
        const amount = calcMealAmountVnd(row)
        return (
          <>
            <ManualField label="날짜" type="date" value={row.meal_date ?? ''}
              onChange={(e) => updateRow('meals', row.clientId, { meal_date: e.target.value || null })} />
            <ManualField label="식당명" value={row.restaurant_name}
              onChange={(e) => updateRow('meals', row.clientId, { restaurant_name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <ManualField label="인원" excelRef="E15" inputMode="decimal" value={row.pax || ''}
                onChange={(e) => updateRow('meals', row.clientId, { pax: parseNum(e.target.value) })} />
              <ManualField label="단가(VND)" excelRef="F15" suffix="₫" inputMode="decimal"
                value={row.unit_price_vnd || ''}
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
            <RowActions
              onDuplicate={() => duplicateRow('meals', row.clientId)}
              onDelete={() => softDeleteRow('meals', row.clientId)}
            />
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
      addLabel="+ 입장료 추가"
      renderRow={(row) => {
        const amount = calcEntranceAmountVnd(row)
        return (
          <>
            <ManualField label="날짜" type="date" value={row.visit_date ?? ''}
              onChange={(e) => updateRow('entrances', row.clientId, { visit_date: e.target.value || null })} />
            <ManualField label="내역" value={row.attraction_name}
              onChange={(e) => updateRow('entrances', row.clientId, { attraction_name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <ManualField label="인원" excelRef="E28" inputMode="decimal" value={row.pax || ''}
                onChange={(e) => updateRow('entrances', row.clientId, { pax: parseNum(e.target.value) })} />
              <ManualField label="단가(VND)" excelRef="F28" suffix="₫" inputMode="decimal" value={row.unit_price_vnd || ''}
                onChange={(e) => updateRow('entrances', row.clientId, { unit_price_vnd: parseNum(e.target.value) })} />
            </div>
            <CalculatedField
              field={{ value: amount, label: '금액(VND)', excelRef: 'H28', formula: 'E28×F28' }}
              currency="vnd"
              compact
            />
            <RowActions
              onDuplicate={() => duplicateRow('entrances', row.clientId)}
              onDelete={() => softDeleteRow('entrances', row.clientId)}
            />
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
  const others = useSettlementFormStore((s) => s.others)
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
      addLabel="+ 기타지출 추가"
      renderRow={(row) => (
        <>
          <ManualField label="내역" value={row.description}
            onChange={(e) => updateRow('others', row.clientId, { description: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <ManualField label="일수" excelRef="D41" inputMode="decimal" value={row.days ?? ''}
              onChange={(e) => updateRow('others', row.clientId, {
                days: e.target.value === '' ? null : parseNum(e.target.value),
              })} />
            <ManualField label="인원" excelRef="E41" inputMode="decimal" value={row.pax || ''}
              onChange={(e) => updateRow('others', row.clientId, { pax: parseNum(e.target.value) })} />
            <label className="flex items-end gap-2 pb-3 text-xs">
              <input type="checkbox" checked={!!row.use_days_for_usd}
                onChange={(e) => updateRow('others', row.clientId, { use_days_for_usd: e.target.checked })}
                className="w-4 h-4" />
              D×E×F
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ManualField label="단가($)" excelRef="F41" suffix="$" inputMode="decimal" value={row.unit_price_usd || ''}
              onChange={(e) => updateRow('others', row.clientId, { unit_price_usd: parseNum(e.target.value) })} />
            <ManualField label="단가(₫)" excelRef="O41" suffix="₫" inputMode="decimal" value={row.unit_price_vnd || ''}
              onChange={(e) => updateRow('others', row.clientId, { unit_price_vnd: parseNum(e.target.value) })} />
          </div>
          <CalculatedField
            field={{ value: calcOtherAmountUsd(row), label: '금액($)', excelRef: 'H41', formula: 'D×E×F or E×F' }}
            compact
          />
          <CalculatedField
            field={{ value: calcOtherAmountVnd(row), label: '금액(₫)', excelRef: 'R41', formula: 'O×P' }}
            currency="vnd"
            compact
          />
          <RowActions
            onDuplicate={() => duplicateRow('others', row.clientId)}
            onDelete={() => softDeleteRow('others', row.clientId)}
          />
          <ItemWithReceipt
            target={{ kind: 'other', rowId: row.id }}
            rowLabel={row.description || undefined}
          />
        </>
      )}
    />
    </div>
  )
}

export function ShoppingSection() {
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
      addLabel="+ 쇼핑 추가"
      renderRow={(row) => (
        <>
          <ManualField label="날짜" type="date" value={row.visit_date ?? ''}
            onChange={(e) => updateRow('shoppings', row.clientId, { visit_date: e.target.value || null })} />
          <ManualField label="샵명" value={row.shop_name}
            onChange={(e) => updateRow('shoppings', row.clientId, { shop_name: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <ManualField label="SALE" excelRef="D57" suffix="$" inputMode="decimal" value={row.sale_usd || ''}
              onChange={(e) => updateRow('shoppings', row.clientId, { sale_usd: parseNum(e.target.value) })} />
            <ManualField label="COM" excelRef="F57" suffix="$" inputMode="decimal" value={row.com_usd || ''}
              onChange={(e) => updateRow('shoppings', row.clientId, { com_usd: parseNum(e.target.value) })} />
            <ManualField label="KB" excelRef="H57" suffix="$" inputMode="decimal" value={row.kb_usd || ''}
              onChange={(e) => updateRow('shoppings', row.clientId, { kb_usd: parseNum(e.target.value) })} />
          </div>
          <RowActions
            onDuplicate={() => duplicateRow('shoppings', row.clientId)}
            onDelete={() => softDeleteRow('shoppings', row.clientId)}
          />
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
        rows={options}
        onAdd={() => addRow('options')}
        addLabel="+ 옵션 추가"
        renderRow={(row) => {
          if (row.is_extra_vehicle) {
            return (
              <>
                <p className="text-sm font-medium text-gray-700">🚌 차량비(추가) · R71</p>
                <div className="grid grid-cols-2 gap-2">
                  <ManualField label="지출($)" excelRef="P71" suffix="$" inputMode="decimal" value={row.expense_usd || ''}
                    onChange={(e) => updateRow('options', row.clientId, { expense_usd: parseNum(e.target.value) })} />
                  <ManualField label="지출(₫)" excelRef="Q71" suffix="₫" inputMode="decimal" value={row.expense_vnd || ''}
                    onChange={(e) => updateRow('options', row.clientId, { expense_vnd: parseNum(e.target.value) })} />
                </div>
                <RowActions
                  onDuplicate={() => duplicateRow('options', row.clientId)}
                  onDelete={() => softDeleteRow('options', row.clientId)}
                />
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
              <ManualField label="날짜" type="date" value={row.option_date ?? ''}
                onChange={(e) => updateRow('options', row.clientId, { option_date: e.target.value || null })} />
              <ManualField label="옵션명" value={row.option_name}
                onChange={(e) => updateRow('options', row.clientId, { option_name: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <ManualField label="판매단가" excelRef="M57" suffix="$" inputMode="decimal"
                  value={row.unit_price_usd || ''}
                  onChange={(e) => updateRow('options', row.clientId, { unit_price_usd: parseNum(e.target.value) })} />
                <ManualField label="인원" excelRef="N57" inputMode="decimal" value={row.pax || ''}
                  onChange={(e) => updateRow('options', row.clientId, { pax: parseNum(e.target.value) })} />
              </div>
              <CalculatedField field={{ value: total, label: '판매총액', excelRef: 'O57', formula: 'M57×N57' }} compact />
              <div className="grid grid-cols-2 gap-2">
                <ManualField label="지출($)" excelRef="P57" suffix="$" inputMode="decimal" value={row.expense_usd || ''}
                  onChange={(e) => updateRow('options', row.clientId, { expense_usd: parseNum(e.target.value) })} />
                <ManualField label="지출(₫)" excelRef="Q57" suffix="₫" inputMode="decimal" value={row.expense_vnd || ''}
                  onChange={(e) => updateRow('options', row.clientId, { expense_vnd: parseNum(e.target.value) })} />
              </div>
              <CalculatedField field={{ value: com, label: 'COM', excelRef: 'S57', formula: 'O57−P57−Q57/Q2' }} compact />
              <RowActions
                onDuplicate={() => duplicateRow('options', row.clientId)}
                onDelete={() => softDeleteRow('options', row.clientId)}
              />
              <ItemWithReceipt
                target={{ kind: 'option', rowId: row.id }}
                rowLabel={row.option_name || undefined}
              />
            </>
          )
        }}
      />
      <button
        type="button"
        onClick={addExtraVehicle}
        className="w-full min-h-11 text-xs font-medium text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-50"
      >
        + 추가차량비 (R71)
      </button>
    </div>
  )
}
