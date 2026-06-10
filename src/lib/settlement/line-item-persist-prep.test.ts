import { describe, expect, it } from 'vitest'
import type { SettlementFull } from '@/types'
import { stateFromMock, toDraftPayload } from './mappers'
import {
  buildLineItemDeleteIds,
  collectKnownLineItemIds,
  stripAllLineItemIdsForCreate,
  stripOrphanLineItemIdsFromPayload,
} from './line-item-persist-prep'

describe('line-item persist prep', () => {
  it('strips all row ids on first create to ignore stale sessionStorage ids', () => {
    const state = stateFromMock('가이드')
    state.hotels[0] = { ...state.hotels[0], id: 'stale-hotel-id', deleted: true }
    state.others[0] = { ...state.others[0], id: 'stale-other-id' }

    const stripped = stripAllLineItemIdsForCreate(toDraftPayload(state))

    expect(stripped.hotels.every((row) => row.id === undefined)).toBe(true)
    expect(stripped.others.every((row) => row.id === undefined)).toBe(true)
  })

  it('drops orphan ids that are not present on the loaded settlement', () => {
    const payload = toDraftPayload(stateFromMock('가이드'))
    payload.hotels[0] = { ...payload.hotels[0], id: 'orphan-hotel' }
    payload.others[0] = {
      ...payload.others[0],
      id: 'orphan-other',
      deleted: true,
    }

    const existing = {
      hotels: [{ id: 'db-hotel-1' }],
      meals: [],
      entrances: [],
      others: [],
      shoppings: [],
      options: [],
    } as unknown as SettlementFull

    const known = collectKnownLineItemIds(existing)
    const stripped = stripOrphanLineItemIdsFromPayload(payload, known)

    expect(stripped.hotels[0]?.id).toBeUndefined()
    expect(stripped.others[0]?.id).toBeUndefined()
    expect(known.has('db-hotel-1')).toBe(true)
  })

  it('buildLineItemDeleteIds removes DB orphans not kept in payload', () => {
    const deleteIds = buildLineItemDeleteIds(
      [
        { id: 'meal-keep', restaurant_name: 'A' } as never,
        { id: 'meal-del', deleted: true },
      ],
      ['meal-keep', 'meal-orphan'],
    )
    expect(deleteIds).toEqual(expect.arrayContaining(['meal-del', 'meal-orphan']))
    expect(deleteIds).not.toContain('meal-keep')
  })
})
