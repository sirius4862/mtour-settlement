import type { ReactNode } from 'react'
import type { SettlementCalcResult } from '@/lib/settlement/types-calc'
import {
  buildSettlementSummaryView,
  type SummaryLine,
  type SummaryLineVariant,
} from '@/lib/settlement/settlement-summary-view'
import {
  displayFieldLabel,
  GUIDE_FOOTER_LABELS,
  GUIDE_PAYOUT_FLOOR_WARNING,
  guideSettlementIsNegative,
  type SummaryAudience,
} from '@/lib/settlement/display-labels'
import { formatUsd } from '../CalculatedField'

function formatLineAmount(amount: number, variant: SummaryLineVariant): string {
  if (variant === 'deduct' && amount > 0) {
    return `−${formatUsd(amount).replace('−', '')}`
  }
  return formatUsd(amount)
}

function lineClassName(variant: SummaryLineVariant): string {
  switch (variant) {
    case 'muted':
      return 'text-gray-400'
    case 'emphasis':
    case 'deduct':
      return 'text-gray-900 font-semibold'
    case 'total':
      return 'text-gray-900 font-bold'
    default:
      return 'text-gray-600'
  }
}

function SummaryLineRow({ line }: { line: SummaryLine }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className={`text-sm ${lineClassName(line.variant)}`}>{line.label}</span>
      <span className={`text-sm font-mono tabular-nums shrink-0 ${lineClassName(line.variant)}`}>
        {formatLineAmount(line.amount, line.variant)}
      </span>
    </div>
  )
}

function SummaryBlock({
  title,
  subtitle,
  helperText,
  children,
  accent,
}: {
  title: string
  subtitle?: string
  helperText?: string
  children: ReactNode
  accent?: 'blue' | 'amber'
}) {
  const border =
    accent === 'blue'
      ? 'border-blue-200 bg-blue-50/40'
      : accent === 'amber'
        ? 'border-amber-200 bg-amber-50/40'
        : 'border-gray-100 bg-white'

  return (
    <section className={`rounded-xl border p-3.5 space-y-2 ${border}`}>
      <div>
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
      {helperText && <p className="text-xs text-gray-500 pt-1 border-t border-gray-100">{helperText}</p>}
    </section>
  )
}

export function SettlementBusinessSummary({
  calc,
  audience = 'admin',
}: {
  calc: SettlementCalcResult
  audience?: SummaryAudience
}) {
  const view = buildSettlementSummaryView(calc)
  const { summary } = calc
  const payoutIsFloored = guideSettlementIsNegative(summary.guide_settlement_usd.value)
  const guideDisplayField =
    audience === 'admin' ? summary.guide_settlement_usd : summary.guide_payout_usd
  const guideLabel =
    audience === 'guide'
      ? GUIDE_FOOTER_LABELS.guideSettlement
      : displayFieldLabel(guideDisplayField, audience)
  const showCompanyProfit = audience === 'admin'

  return (
    <div className="space-y-3">
      <SummaryBlock title={view.revenue.title} helperText={view.revenue.helperText}>
        <div className="space-y-0.5">
          {view.revenue.lines.map((line) => (
            <SummaryLineRow key={line.key} line={line} />
          ))}
        </div>
      </SummaryBlock>

      <SummaryBlock title={view.deductions.title} subtitle={view.deductions.subtitle}>
        <div className="space-y-0.5">
          {view.deductions.lines.map((line) => {
            if (line.key === 'other-deduction') {
              return (
                <details key={line.key} className="group">
                  <summary className="flex items-start justify-between gap-3 py-1 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <span className="text-sm text-gray-600 flex items-center gap-1">
                      <span className="text-[10px] text-gray-400 group-open:rotate-90 transition-transform inline-block">
                        ▸
                      </span>
                      {line.label}
                    </span>
                    <span className="text-sm font-mono tabular-nums text-gray-600 shrink-0">
                      {formatUsd(line.amount)}
                    </span>
                  </summary>
                  <div className="pl-4 pb-1 space-y-0.5 border-l border-gray-100 ml-1">
                    {view.otherDeductionBreakdown.map((item) => (
                      <SummaryLineRow key={item.key} line={item} />
                    ))}
                  </div>
                </details>
              )
            }
            return <SummaryLineRow key={line.key} line={line} />
          })}
        </div>
      </SummaryBlock>

      <SummaryBlock title={view.balance.title} helperText={view.balance.helperText} accent="blue">
        {view.balance.lines.map((line) => (
          <SummaryLineRow key={line.key} line={line} />
        ))}
      </SummaryBlock>

      <SummaryBlock title={view.finals.title} accent="amber">
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-semibold text-amber-900">{guideLabel}</span>
            <span className="text-lg font-mono font-bold text-amber-900 tabular-nums">
              {formatUsd(guideDisplayField.value)}
            </span>
          </div>
          {audience === 'admin' && payoutIsFloored && (
            <div className="flex items-start justify-between gap-3 pt-2 border-t border-amber-200">
              <span className="text-sm text-amber-800">
                {displayFieldLabel(summary.guide_payout_usd, 'admin')}
              </span>
              <span className="text-sm font-mono font-semibold text-amber-900 tabular-nums">
                {formatUsd(summary.guide_payout_usd.value)}
              </span>
            </div>
          )}
          {payoutIsFloored && audience === 'guide' && (
            <p className="text-xs text-amber-700">{GUIDE_PAYOUT_FLOOR_WARNING}</p>
          )}
        </div>
        {showCompanyProfit && (
          <div className="flex items-start justify-between gap-3 pt-2">
            <span className="text-sm font-semibold text-emerald-800">
              {displayFieldLabel(summary.company_grand_total_usd, 'admin')}
            </span>
            <span className="text-sm font-mono font-bold text-emerald-800 tabular-nums">
              {formatUsd(summary.company_grand_total_usd.value)}
            </span>
          </div>
        )}
      </SummaryBlock>
    </div>
  )
}
