'use client'

import { useSettlementFormStore } from '@/lib/stores/settlementFormStore'
import {
  ADMIN_GUIDE_INPUT_HINT,
  canEditHeaderField,
  GUIDE_INPUT_FIELD_HINT,
} from '@/lib/settlement/field-ownership'
import { ManualField, SectionCard } from '@/components/ui/FormPrimitives'
import { calcCompanyExpenseRowCombinedUsd } from '@/lib/settlement/calc'
import { DynamicRowList, parseNum, RowActions } from '../rows/DynamicRowList'
import { CalculatedField } from '../CalculatedField'
import { useSettlementFormRole } from '../SettlementFormContext'
import { SectionHint } from '../SectionHint'
import { EXCEL_SECTIONS } from '@/lib/settlement/excel-sections'

function GuideMegugiDailyFields() {
  const role = useSettlementFormRole()
  const header = useSettlementFormStore((s) => s.header)
  const patchHeader = useSettlementFormStore((s) => s.patchHeader)

  return (
    <>
      <ManualField
        label="메꾸기"
        excelRef="R80"
        suffix="$"
        inputMode="decimal"
        hint={GUIDE_INPUT_FIELD_HINT}
        value={header.megugi_usd || ''}
        disabled={!canEditHeaderField(role, 'megugi_usd')}
        onChange={(e) =>
          patchHeader({ megugi_usd: parseFloat(e.target.value) || 0 })
        }
      />
      <ManualField
        label="가이드 일비"
        excelRef="R82"
        suffix="$"
        inputMode="decimal"
        hint={GUIDE_INPUT_FIELD_HINT}
        value={header.guide_daily_fee_usd || ''}
        disabled={!canEditHeaderField(role, 'guide_daily_fee_usd')}
        onChange={(e) =>
          patchHeader({ guide_daily_fee_usd: parseFloat(e.target.value) || 0 })
        }
      />
    </>
  )
}

function CompanyReviewFields({ adminView }: { adminView?: boolean }) {
  const role = useSettlementFormRole()
  const header = useSettlementFormStore((s) => s.header)
  const patchHeader = useSettlementFormStore((s) => s.patchHeader)

  const variant = adminView ? 'adminReviewGuideInput' : 'companyReview'
  const hint = adminView ? ADMIN_GUIDE_INPUT_HINT : GUIDE_INPUT_FIELD_HINT

  return (
    <>
      <ManualField
        label="메꾸기"
        excelRef="R80"
        suffix="$"
        inputMode="decimal"
        variant={variant}
        hint={hint}
        value={header.megugi_usd || ''}
        disabled={!canEditHeaderField(role, 'megugi_usd')}
        onChange={(e) =>
          patchHeader({ megugi_usd: parseFloat(e.target.value) || 0 })
        }
      />
      <ManualField
        label="가이드 일비"
        excelRef="R82"
        suffix="$"
        inputMode="decimal"
        variant={variant}
        hint={hint}
        value={header.guide_daily_fee_usd || ''}
        disabled={!canEditHeaderField(role, 'guide_daily_fee_usd')}
        onChange={(e) =>
          patchHeader({ guide_daily_fee_usd: parseFloat(e.target.value) || 0 })
        }
      />
    </>
  )
}

export function GuideMegugiDailySection() {
  return (
    <div className="space-y-3">
      <SectionHint
        excelRows="R80, R82"
        hint="메꾸기와 가이드 일비를 입력하세요."
      />
      <SectionCard>
        <GuideMegugiDailyFields />
      </SectionCard>
    </div>
  )
}

export function TCSettlementSection() {
  const role = useSettlementFormRole()
  const header = useSettlementFormStore((s) => s.header)
  const patchHeader = useSettlementFormStore((s) => s.patchHeader)
  const isAdmin = role === 'admin'

  return (
    <div className="space-y-3">
      <SectionHint excelRows={EXCEL_SECTIONS.tc.rows} hint={EXCEL_SECTIONS.tc.hint} />
      <SectionCard>
        <ManualField
          label="T/C 정산 — 가이드분 (USD)"
          excelRef="H83"
          suffix="$"
          inputMode="decimal"
          value={header.tc_guide_usd || ''}
          disabled={!canEditHeaderField(role, 'tc_guide_usd')}
          onChange={(e) =>
            patchHeader({ tc_guide_usd: parseFloat(e.target.value) || 0 })
          }
        />
        {isAdmin && (
          <ManualField
            label="T/C 정산 — 회사분 (USD)"
            excelRef="J83"
            suffix="$"
            inputMode="decimal"
            value={header.tc_company_usd || ''}
            onChange={(e) =>
              patchHeader({ tc_company_usd: parseFloat(e.target.value) || 0 })
            }
          />
        )}
      </SectionCard>
    </div>
  )
}

function CompanyExpensesBlock() {
  const rate = useSettlementFormStore((s) => s.exchange_rate)
  const rows = useSettlementFormStore((s) => s.companyExpenses ?? [])
  const addRow = useSettlementFormStore((s) => s.addCompanyExpenseRow)
  const updateRow = useSettlementFormStore((s) => s.updateCompanyExpenseRow)
  const duplicateRow = useSettlementFormStore((s) => s.duplicateCompanyExpenseRow)
  const softDeleteRow = useSettlementFormStore((s) => s.softDeleteCompanyExpenseRow)

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold text-red-800 mb-2">회사 비용 (admin)</p>
      <p className="text-[10px] text-gray-500 mb-2">
        호텔 선결제·식당 보증금·차량 선금·티켓 선금·업체 결제 등 회사가 선지급한 비용. 회사 수익에만 반영됩니다.
      </p>
      <DynamicRowList
        rows={rows}
        onAdd={() => addRow()}
        addLabel="+ 회사 비용 추가"
        renderRow={(row) => {
          const combinedUsd = calcCompanyExpenseRowCombinedUsd(row, rate)
          return (
            <>
              <ManualField
                label="비용 항목"
                value={row.description}
                onChange={(e) =>
                  updateRow(row.clientId, { description: e.target.value })
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <ManualField
                  label="USD 금액"
                  suffix="$"
                  inputMode="decimal"
                  value={row.amount_usd || ''}
                  onChange={(e) =>
                    updateRow(row.clientId, { amount_usd: parseNum(e.target.value) })
                  }
                />
                <ManualField
                  label="VND 금액"
                  suffix="₫"
                  inputMode="decimal"
                  value={row.amount_vnd || ''}
                  onChange={(e) =>
                    updateRow(row.clientId, { amount_vnd: parseNum(e.target.value) })
                  }
                />
              </div>
              <ManualField
                label="메모 (선택)"
                value={row.note ?? ''}
                onChange={(e) =>
                  updateRow(row.clientId, { note: e.target.value || null })
                }
              />
              {(row.amount_usd > 0 || row.amount_vnd > 0) && (
                <CalculatedField
                  field={{
                    value: combinedUsd,
                    label: '환산 합계',
                    excelRef: 'O82+',
                    formula: 'USD + ₫/Q2',
                  }}
                  compact
                />
              )}
              <RowActions
                onDuplicate={() => duplicateRow(row.clientId)}
                onDelete={() => softDeleteRow(row.clientId)}
              />
            </>
          )
        }}
      />
    </div>
  )
}

export function FinalAdjustmentsSection() {
  const header = useSettlementFormStore((s) => s.header)
  const patchHeader = useSettlementFormStore((s) => s.patchHeader)

  return (
    <div className="space-y-3">
      <SectionHint excelRows={EXCEL_SECTIONS.adjustments.rows} hint={EXCEL_SECTIONS.adjustments.hint} />
      <SectionCard>
        <p className="text-xs font-semibold text-emerald-800 mb-2">지상비 (admin)</p>
        <ManualField
          label="지상비"
          excelRef="—"
          suffix="$"
          inputMode="decimal"
          value={header.ground_fee_usd || ''}
          onChange={(e) =>
            patchHeader({ ground_fee_usd: parseFloat(e.target.value) || 0 })
          }
        />
        <p className="text-xs font-semibold text-red-800 mt-4 mb-2">회사 지출 (admin)</p>
        <ManualField
          label="차량비"
          excelRef="O79"
          suffix="$"
          inputMode="decimal"
          value={header.vehicle_fee_usd || ''}
          onChange={(e) =>
            patchHeader({ vehicle_fee_usd: parseFloat(e.target.value) || 0 })
          }
        />
        <ManualField
          label="인두세"
          excelRef="O80"
          suffix="$"
          inputMode="decimal"
          value={header.head_tax_usd || ''}
          onChange={(e) =>
            patchHeader({ head_tax_usd: parseFloat(e.target.value) || 0 })
          }
        />
        <ManualField
          label="서울영업비"
          excelRef="O81"
          suffix="$"
          inputMode="decimal"
          value={header.seoul_biz_fee_usd || ''}
          onChange={(e) =>
            patchHeader({ seoul_biz_fee_usd: parseFloat(e.target.value) || 0 })
          }
        />
        <CompanyExpensesBlock />
        <CompanyReviewFields adminView />
        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-600">
            정산비율{' '}
            <span className="font-mono text-blue-600">
              {Math.round(header.settlement_ratio * 100)}%
            </span>
            <span className="text-gray-400"> · 참고 전용</span>
          </p>
          <p className="text-[10px] text-gray-400 mt-1">
            실제 지급액 계산에 반영되지 않습니다. 슬라이더는 비활성화되어 있습니다.
          </p>
        </div>
      </SectionCard>
    </div>
  )
}
