'use client'

import { calcSettlement } from '@/lib/settlement/calc'
import { toCalcInput } from '@/lib/settlement/mappers'
import type { SettlementCalcResult } from '@/lib/settlement/types-calc'
import { useSettlementFormStore } from '@/lib/stores/settlementFormStore'

/** Live calc from Zustand form state — calcSettlement() only. */
export function useSettlementFormCalc(): SettlementCalcResult {
  return useSettlementFormStore((s) => calcSettlement(toCalcInput(s)))
}
