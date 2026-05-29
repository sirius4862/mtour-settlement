'use client'

import { useMemo } from 'react'
import { calcSettlement } from '@/lib/settlement/calc'
import { toCalcInput } from '@/lib/settlement/mappers'
import type { SettlementFormState } from '@/lib/settlement/form-types'
import type { SettlementCalcResult } from '@/lib/settlement/types-calc'
import { useSettlementFormStore } from '@/lib/stores/settlementFormStore'

/** Live calc from Zustand form state — calcSettlement() only. */
export function useSettlementFormCalc(): SettlementCalcResult {
  const exchange_rate = useSettlementFormStore((s) => s.exchange_rate)
  const header = useSettlementFormStore((s) => s.header)
  const hotels = useSettlementFormStore((s) => s.hotels)
  const meals = useSettlementFormStore((s) => s.meals)
  const entrances = useSettlementFormStore((s) => s.entrances)
  const others = useSettlementFormStore((s) => s.others)
  const companyExpenses = useSettlementFormStore((s) => s.companyExpenses)
  const shoppings = useSettlementFormStore((s) => s.shoppings)
  const options = useSettlementFormStore((s) => s.options)

  return useMemo(() => {
    const slice: Pick<
      SettlementFormState,
      | 'exchange_rate'
      | 'header'
      | 'hotels'
      | 'meals'
      | 'entrances'
      | 'others'
      | 'companyExpenses'
      | 'shoppings'
      | 'options'
    > = {
      exchange_rate,
      header,
      hotels: hotels ?? [],
      meals: meals ?? [],
      entrances: entrances ?? [],
      others: others ?? [],
      companyExpenses: companyExpenses ?? [],
      shoppings: shoppings ?? [],
      options: options ?? [],
    }
    return calcSettlement(toCalcInput(slice as SettlementFormState))
  }, [exchange_rate, header, hotels, meals, entrances, others, companyExpenses, shoppings, options])
}
