import type { SettlementFull } from '@/types'
import type { SettlementDraftPayload } from './mappers'

type LineItemPayload = Pick<
  SettlementDraftPayload,
  'hotels' | 'meals' | 'entrances' | 'others' | 'shoppings' | 'options'
>

type DraftRow = { id?: string; clientId?: string; deleted?: boolean }

export type LineItemDuplicateDiagnosis = {
  section: keyof LineItemPayload
  kind: 'duplicate_id' | 'duplicate_client_id'
  id?: string
  clientId?: string
  count: number
}

function dedupeSectionRows<T extends DraftRow>(rows: T[]): T[] {
  const seenIds = new Set<string>()
  const seenClientIds = new Set<string>()
  const out: T[] = []

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!
    if (row.id) {
      if (seenIds.has(row.id)) continue
      seenIds.add(row.id)
    }
    if (row.clientId) {
      if (seenClientIds.has(row.clientId)) continue
      seenClientIds.add(row.clientId)
    }
    out.unshift(row)
  }

  return out
}

/** Detect duplicate active rows in a draft payload before save. */
export function diagnoseDraftLineItemDuplicates(
  payload: LineItemPayload,
): LineItemDuplicateDiagnosis[] {
  const sections: (keyof LineItemPayload)[] = [
    'hotels',
    'meals',
    'entrances',
    'others',
    'shoppings',
    'options',
  ]
  const findings: LineItemDuplicateDiagnosis[] = []

  for (const section of sections) {
    const rows = payload[section] ?? []
    const active = rows.filter((r) => !r.deleted)

    const idCounts = new Map<string, number>()
    const clientCounts = new Map<string, number>()
    for (const row of active) {
      if (row.id) idCounts.set(row.id, (idCounts.get(row.id) ?? 0) + 1)
      if (row.clientId) {
        clientCounts.set(row.clientId, (clientCounts.get(row.clientId) ?? 0) + 1)
      }
    }

    for (const [id, count] of idCounts) {
      if (count > 1) findings.push({ section, kind: 'duplicate_id', id, count })
    }
    for (const [clientId, count] of clientCounts) {
      if (count > 1) findings.push({ section, kind: 'duplicate_client_id', clientId, count })
    }
  }

  return findings
}

/** Normalize draft line-item arrays before save — dedupe by id/clientId. */
export function normalizeDraftLineItemPayload(
  payload: SettlementDraftPayload,
): SettlementDraftPayload {
  return {
    ...payload,
    hotels: dedupeSectionRows(payload.hotels ?? []),
    meals: dedupeSectionRows(payload.meals ?? []),
    entrances: dedupeSectionRows(payload.entrances ?? []),
    others: dedupeSectionRows(payload.others ?? []),
    shoppings: dedupeSectionRows(payload.shoppings ?? []),
    options: dedupeSectionRows(payload.options ?? []),
  }
}

function stripUnknownRowId<T extends { id?: string }>(
  row: T,
  knownIds: Set<string>,
): T {
  if (!row.id || knownIds.has(row.id)) return row
  const { id: _omit, ...rest } = row
  return rest as T
}

function stripSectionOrphanIds<T extends { id?: string }>(
  rows: T[],
  knownIds: Set<string>,
): T[] {
  return rows.map((row) => stripUnknownRowId(row, knownIds))
}

/** DB ids currently attached to a settlement — used to drop stale sessionStorage ids. */
export function collectKnownLineItemIds(full: SettlementFull | null | undefined): Set<string> {
  const ids = new Set<string>()
  if (!full) return ids

  for (const row of [
    ...full.hotels,
    ...full.meals,
    ...full.entrances,
    ...full.others,
    ...full.shoppings,
    ...full.options,
  ]) {
    if (row.id) ids.add(row.id)
  }

  return ids
}

/** Remove client/session ids that do not exist on the server settlement yet. */
export function stripOrphanLineItemIdsFromPayload(
  payload: SettlementDraftPayload,
  knownIds: Set<string>,
): SettlementDraftPayload {
  return {
    ...payload,
    hotels: stripSectionOrphanIds(payload.hotels, knownIds),
    meals: stripSectionOrphanIds(payload.meals, knownIds),
    entrances: stripSectionOrphanIds(payload.entrances, knownIds),
    others: stripSectionOrphanIds(payload.others, knownIds),
    shoppings: stripSectionOrphanIds(payload.shoppings, knownIds),
    options: stripSectionOrphanIds(payload.options ?? [], knownIds),
  }
}

/** First create must never send stale ids from a prior session/edit. */
export function stripAllLineItemIdsForCreate(
  payload: SettlementDraftPayload,
): SettlementDraftPayload {
  const strip = <T extends { id?: string }>(rows: T[]) =>
    rows.map(({ id: _omit, ...rest }) => rest as T)

  return {
    ...payload,
    hotels: strip(payload.hotels),
    meals: strip(payload.meals),
    entrances: strip(payload.entrances),
    others: strip(payload.others),
    shoppings: strip(payload.shoppings),
    options: strip(payload.options ?? []),
  }
}

export function lineItemSections(payload: LineItemPayload): LineItemPayload {
  return {
    hotels: payload.hotels,
    meals: payload.meals,
    entrances: payload.entrances,
    others: payload.others,
    shoppings: payload.shoppings,
    options: payload.options,
  }
}

/** DB ids the payload will keep (active rows with ids). */
export function keepLineItemIdsFromPayload(
  rows: Array<{ id?: string; deleted?: boolean }>,
): Set<string> {
  const keepIds = new Set<string>()
  for (const row of rows) {
    if (!row.deleted && row.id) keepIds.add(row.id)
  }
  return keepIds
}

/**
 * Ids to delete before insert/update: soft-deleted draft rows + DB orphans
 * (known from pre-loaded settlement, not bulk SELECT on base tables).
 */
export function buildLineItemDeleteIds(
  draftRows: Array<{ id?: string; deleted?: boolean }>,
  existingIds: string[],
): string[] {
  const keepIds = keepLineItemIdsFromPayload(draftRows)
  const ids: string[] = []
  for (const row of draftRows) {
    if (row.deleted && row.id) ids.push(row.id)
  }
  for (const id of existingIds) {
    if (!keepIds.has(id)) ids.push(id)
  }
  return [...new Set(ids)]
}
