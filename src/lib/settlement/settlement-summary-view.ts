import type { SettlementCalcResult } from './types-calc'

export type SummaryLineVariant = 'default' | 'muted' | 'emphasis' | 'deduct' | 'total'

export interface SummaryLine {
  key: string
  label: string
  amount: number
  variant: SummaryLineVariant
}

export interface SummarySectionData {
  title: string
  subtitle?: string
  lines: SummaryLine[]
  helperText?: string
}

export interface SettlementSummaryViewModel {
  revenue: SummarySectionData
  deductions: SummarySectionData
  balance: SummarySectionData
  finals: SummarySectionData
  otherDeductionBreakdown: SummaryLine[]
}

function matrixRow(calc: SettlementCalcResult, key: string) {
  return calc.matrix.find((r) => r.key === key)
}

/** UI-only grouping from existing calc output — does not alter calc.ts. */
export function buildSettlementSummaryView(calc: SettlementCalcResult): SettlementSummaryViewModel {
  const { summary } = calc
  const r80 = matrixRow(calc, 'r80')
  const r81 = matrixRow(calc, 'r81')
  const r84 = matrixRow(calc, 'r84')
  const r79 = matrixRow(calc, 'r79')
  const r82 = matrixRow(calc, 'r82')
  const r83 = matrixRow(calc, 'r83')

  const megugi = r80?.settlement?.value ?? 0
  const tcSettlement = r81?.settlement?.value ?? 0
  const guideExpense = r84?.guideExpense?.value ?? 0
  const vehicleFee = r79?.included?.value ?? 0
  const headTax = r82?.included?.value ?? 0
  const seoulBiz = r81?.included?.value ?? 0
  const companyFlex = calc.sections.company_expenses.combined_usd.value
  const otherDeductionTotal = r84?.included?.value ?? 0

  return {
    revenue: {
      title: '1. 총 수익',
      lines: [
        {
          key: 'shopping-com',
          label: '쇼핑 COM',
          amount: r80?.income?.value ?? 0,
          variant: 'default',
        },
        {
          key: 'option-com',
          label: '옵션 COM',
          amount: r81?.income?.value ?? 0,
          variant: 'default',
        },
        {
          key: 'extra-income',
          label: '추가수익',
          amount: r83?.income?.value ?? 0,
          variant: 'muted',
        },
        {
          key: 'tips',
          label: '받은 팁',
          amount: r82?.income?.value ?? 0,
          variant: 'muted',
        },
        {
          key: 'com-total',
          label: '정산 수익 (COM 합계)',
          amount: summary.income_total_usd.value,
          variant: 'total',
        },
      ],
      helperText: '정산 분배 기준은 쇼핑 COM + 옵션 COM입니다.',
    },
    deductions: {
      title: '2. 공제 항목',
      subtitle: '메꾸기·TC 정산이 50:50 분배에 반영됩니다.',
      lines: [
        {
          key: 'megugi',
          label: '메꾸기',
          amount: megugi,
          variant: 'deduct',
        },
        {
          key: 'tc',
          label: 'TC 정산',
          amount: tcSettlement,
          variant: 'deduct',
        },
        {
          key: 'guide-expense',
          label: '가이드 지출',
          amount: guideExpense,
          variant: 'muted',
        },
        {
          key: 'other-deduction',
          label: '기타 공제',
          amount: otherDeductionTotal,
          variant: 'default',
        },
      ],
    },
    otherDeductionBreakdown: [
      { key: 'vehicle', label: '차량비', amount: vehicleFee, variant: 'muted' },
      { key: 'head-tax', label: '인두세', amount: headTax, variant: 'muted' },
      { key: 'seoul-biz', label: '서울영업비', amount: seoulBiz, variant: 'muted' },
      ...(companyFlex > 0
        ? [{ key: 'company-flex', label: '회사 비용', amount: companyFlex, variant: 'muted' as const }]
        : []),
    ],
    balance: {
      title: '3. 정산 대상 금액',
      lines: [
        {
          key: 'balance',
          label: '차액 (밸런스)',
          amount: summary.balance_usd.value,
          variant: 'total',
        },
      ],
      helperText: '차액 = 정산 수익 − 메꾸기 − TC 정산',
    },
    finals: {
      title: '4. 최종 결과',
      lines: [],
    },
  }
}
