'use client'

import { useMemo } from 'react'
import { calcSettlement } from '@/lib/settlement/calc'
import type { SettlementCalcInput, SettlementCalcResult } from '@/lib/settlement/types-calc'

export function useSettlementCalc(input: SettlementCalcInput): SettlementCalcResult {
  return useMemo(() => calcSettlement(input), [input])
}
