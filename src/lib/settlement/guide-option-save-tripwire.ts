import { logServerWarning } from '@/lib/server/safe-errors'
import { buildGuideOptionDeleteIds } from './line-item-persist-prep'
import type { DraftOptionRow } from './form-types'
import { isGuideEditableSettlementStatus } from './noop-draft-save-fast-path'

export const P0_OPTION_TRIPWIRE_DELETE_IDS_TAG = '[P0_OPTION_TRIPWIRE_DELETE_IDS]'
export const P0_OPTION_TRIPWIRE_OPTION_COUNT_DECREASE_TAG =
  '[P0_OPTION_TRIPWIRE_OPTION_COUNT_DECREASE]'
export const P0_OPTION_TRIPWIRE_ERROR_TAG = '[P0_OPTION_TRIPWIRE_ERROR]'

export const P0_OPTION_TRIPWIRE_DELETE_IDS_SAMPLE_MAX = 5

export type GuideOptionSaveTripwireMode = 'draft_save_only' | 'save_before_submit'
export type GuideOptionTripwirePhase = 'pre_persist' | 'post_persist'

export interface GuideOptionTripwirePreResult {
  priorGuideOptionCount: number
  incomingGuideOptionCount: number
  explicitDeleteIntent: boolean
}

export interface GuideOptionSaveTripwirePreInput {
  settlementId: string
  payloadOptions: DraftOptionRow[] | null | undefined
  existingOptions: Array<{ id?: string; is_extra_vehicle?: boolean | null }> | null | undefined
  saveMode: GuideOptionSaveTripwireMode
  isEditPath: boolean
}

export interface GuideOptionSaveTripwirePostInput {
  settlementId: string
  priorGuideOptionCount: number | undefined
  postOptions: Array<{ is_extra_vehicle?: boolean | null }> | null | undefined
  payloadOptions: DraftOptionRow[] | null | undefined
  status: unknown
  saveMode: GuideOptionSaveTripwireMode
  explicitDeleteIntent: boolean | undefined
  isEditPath: boolean
}

/** Count persisted or draft guide option rows (excludes admin extra-vehicle rows). */
export function countGuideOptionItems(
  rows: Array<{ is_extra_vehicle?: boolean | null }> | null | undefined,
): number {
  return (rows ?? []).filter((row) => row.is_extra_vehicle !== true).length
}

/** Active (non-deleted) guide option rows in an incoming draft payload. */
export function countIncomingGuideOptionItems(
  rows: Array<{ deleted?: boolean; is_extra_vehicle?: boolean | null }> | null | undefined,
): number {
  return (rows ?? []).filter((row) => row.is_extra_vehicle !== true && !row.deleted).length
}

export function hasExplicitGuideOptionDeleteIntent(
  rows: Pick<DraftOptionRow, 'deleted' | 'is_extra_vehicle' | 'id'>[] | null | undefined,
): boolean {
  return (rows ?? []).some(
    (row) => row.is_extra_vehicle !== true && row.deleted === true && !!row.id,
  )
}

export function sampleDeleteIdsForTripwireLog(
  deleteIds: string[],
  max = P0_OPTION_TRIPWIRE_DELETE_IDS_SAMPLE_MAX,
): string[] {
  return deleteIds.slice(0, max)
}

export function shouldWarnGuideOptionDeleteIdsPlanned(input: {
  deleteIds: string[]
}): boolean {
  return input.deleteIds.length > 0
}

export function shouldWarnGuideOptionCountDecrease(input: {
  priorGuideOptionCount: number
  postGuideOptionCount: number
  status: unknown
  explicitDeleteIntent: boolean
}): boolean {
  return (
    !input.explicitDeleteIntent &&
    input.priorGuideOptionCount > input.postGuideOptionCount &&
    isGuideEditableSettlementStatus(input.status)
  )
}

export function guideOptionCountDecreaseReason(
  priorGuideOptionCount: number,
  postGuideOptionCount: number,
): 'to_zero' | 'partial' | null {
  if (priorGuideOptionCount <= postGuideOptionCount) return null
  return postGuideOptionCount === 0 ? 'to_zero' : 'partial'
}

function logTripwireError(
  phase: GuideOptionTripwirePhase,
  settlementId: string,
  error: unknown,
): void {
  try {
    logServerWarning(`${P0_OPTION_TRIPWIRE_ERROR_TAG} tripwire failed`, {
      settlementId,
      phase,
      message: error instanceof Error ? error.message : String(error),
    })
  } catch {
    // Last-resort: never propagate tripwire failures into save path.
  }
}

export function warnGuideOptionDeleteIdsPlanned(input: {
  settlementId: string
  deleteIds: string[]
  priorGuideOptionCount: number
  incomingGuideOptionCount: number
  saveMode: GuideOptionSaveTripwireMode
  explicitDeleteIntent: boolean
}): void {
  if (!shouldWarnGuideOptionDeleteIdsPlanned(input)) return

  logServerWarning(
    `${P0_OPTION_TRIPWIRE_DELETE_IDS_TAG} guide option delete ids planned`,
    {
      settlementId: input.settlementId,
      deleteIdsCount: input.deleteIds.length,
      deleteIdsSample: sampleDeleteIdsForTripwireLog(input.deleteIds),
      priorGuideOptionCount: input.priorGuideOptionCount,
      incomingGuideOptionCount: input.incomingGuideOptionCount,
      saveMode: input.saveMode,
      explicitDeleteIntent: input.explicitDeleteIntent,
    },
  )
}

export function warnGuideOptionCountDecrease(input: {
  settlementId: string
  priorGuideOptionCount: number
  postGuideOptionCount: number
  status: unknown
  saveMode: GuideOptionSaveTripwireMode
  explicitDeleteIntent: boolean
}): void {
  if (!shouldWarnGuideOptionCountDecrease(input)) return

  const decreaseReason = guideOptionCountDecreaseReason(
    input.priorGuideOptionCount,
    input.postGuideOptionCount,
  )

  logServerWarning(
    `${P0_OPTION_TRIPWIRE_OPTION_COUNT_DECREASE_TAG} guide option_items decreased without explicit delete intent`,
    {
      settlementId: input.settlementId,
      priorGuideOptionCount: input.priorGuideOptionCount,
      postGuideOptionCount: input.postGuideOptionCount,
      status: input.status,
      saveMode: input.saveMode,
      explicitDeleteIntent: input.explicitDeleteIntent,
      decreaseReason,
    },
  )
}

/** Pre-persist tripwire — never throws; failures are logged and swallowed. */
export function runGuideOptionSaveTripwirePrePersist(
  input: GuideOptionSaveTripwirePreInput,
): GuideOptionTripwirePreResult | undefined {
  if (!input.isEditPath) return undefined

  try {
    const priorGuideOptionCount = countGuideOptionItems(input.existingOptions)
    const incomingGuideOptionCount = countIncomingGuideOptionItems(input.payloadOptions)
    const explicitDeleteIntent = hasExplicitGuideOptionDeleteIntent(input.payloadOptions)
    const deleteIds = buildGuideOptionDeleteIds(
      input.payloadOptions ?? [],
      input.existingOptions ?? [],
    )

    warnGuideOptionDeleteIdsPlanned({
      settlementId: input.settlementId,
      deleteIds,
      priorGuideOptionCount,
      incomingGuideOptionCount,
      saveMode: input.saveMode,
      explicitDeleteIntent,
    })

    return {
      priorGuideOptionCount,
      incomingGuideOptionCount,
      explicitDeleteIntent,
    }
  } catch (error) {
    logTripwireError('pre_persist', input.settlementId, error)
    return undefined
  }
}

/** Post-persist tripwire — never throws; failures are logged and swallowed. */
export function runGuideOptionSaveTripwirePostPersist(
  input: GuideOptionSaveTripwirePostInput,
): void {
  if (!input.isEditPath) return

  try {
    const priorGuideOptionCount = input.priorGuideOptionCount ?? 0
    const postGuideOptionCount = countGuideOptionItems(input.postOptions)
    const explicitDeleteIntent =
      input.explicitDeleteIntent ??
      hasExplicitGuideOptionDeleteIntent(input.payloadOptions)

    warnGuideOptionCountDecrease({
      settlementId: input.settlementId,
      priorGuideOptionCount,
      postGuideOptionCount,
      status: input.status,
      saveMode: input.saveMode,
      explicitDeleteIntent,
    })
  } catch (error) {
    logTripwireError('post_persist', input.settlementId, error)
  }
}
