import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(process.cwd())

function readRepoFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

function saveSettlementDraftBody(): string {
  const source = readRepoFile('src/lib/actions/settlementActions.ts')
  const start = source.indexOf('export async function saveSettlementDraft')
  const end = source.indexOf('export async function saveAdminSettlementEdits', start)
  return source.slice(start, end)
}

describe('save phase 1 edit-path parallelization (source-level)', () => {
  const body = saveSettlementDraftBody()

  it('edit save parallelizes header upsert with line-item pre-load after settlement core', () => {
    expect(body).toContain('loadSettlementCore(')
    expect(body).toContain('loadSettlementLineItemRows(')
    expect(body).toContain('Promise.all([')
    expect(body).toContain('upsertSettlement(headerUpsertInput)')
    expect(body).toContain('canSkipPostSaveReloadForNoopSave(')
    expect(body).toContain('buildGuideHeaderUpsertFromDraft(')
    expect(body).toContain("callPurpose: 'pre_load'")
  })

  it('changed edit save runs parallel pre-load before post-save skip decision (not gated by fast path)', () => {
    const editStart = body.indexOf('if (payload.settlementId)')
    const editElse = body.indexOf('} else {', editStart)
    const editBlock = body.slice(editStart, editElse)

    const parallelIdx = editBlock.indexOf('Promise.all([')
    const persistIdx = body.indexOf('persistSettlementLineItems(', editStart)
    const skipIdx = body.indexOf('canSkipPostSaveReloadForNoopSave(', editStart)

    expect(parallelIdx).toBeGreaterThan(-1)
    expect(parallelIdx).toBeLessThan(persistIdx - editStart)
    expect(skipIdx).toBeGreaterThan(persistIdx)
    expect(editBlock).not.toContain('if (skipPostSaveReload')
    expect(editBlock).not.toContain('if (canSkipPostSaveReloadForNoopSave')
  })

  it('no-change and changed edit saves share the same unconditional parallel batch', () => {
    const editStart = body.indexOf('if (payload.settlementId)')
    const editElse = body.indexOf('} else {', editStart)
    const editBlock = body.slice(editStart, editElse)

    expect((editBlock.match(/Promise\.all\(\[/g) ?? []).length).toBe(1)
    expect(editBlock).toContain(
      'loadSettlementLineItemRows(supabase, payload.settlementId, coreLoad.useGuideRead)',
    )
    expect(editBlock).toContain('upsertSettlement(headerUpsertInput)')
  })

  it('new settlement create remains sequential and binds created id via upsertSettlement', () => {
    expect(body).toContain('if (!payload.settlementId) {')
    expect(body).toContain('stripAllLineItemIdsForCreate(')
    const createBlock = body.slice(body.indexOf('if (!payload.settlementId) {'))
    expect(createBlock).toContain('headerResult = await upsertSettlement(')
    expect(createBlock.indexOf('Promise.all([')).toBe(-1)
  })

  it('edit save still strips orphan ids before sanitize and line-item persist', () => {
    expect(body).toContain('stripOrphanLineItemIdsFromPayload(payload, knownLineItemIds)')
    expect(body).toContain('sanitizeGuideDraftPayload(payloadToSave, existingForItemPersist)')
    expect(body).toContain('collectKnownLineItemIds(existingForItemPersist)')
    const stripIdx = body.indexOf('stripOrphanLineItemIdsFromPayload(payload, knownLineItemIds)')
    const sanitizeIdx = body.indexOf('sanitizeGuideDraftPayload(payloadToSave, existingForItemPersist)')
    expect(stripIdx).toBeGreaterThan(-1)
    expect(sanitizeIdx).toBeGreaterThan(stripIdx)
  })

  it('post-save reload remains and is tagged for diagnostics', () => {
    expect(body).toContain("callPurpose: 'post_save_reload'")
    expect((body.match(/getSettlementFull\(/g) ?? []).length).toBe(1)
  })

  it('header fields use mergeGuideHeaderForSave via buildGuideHeaderUpsertFromDraft', () => {
    const actions = readRepoFile('src/lib/actions/settlementActions.ts')
    expect(actions).toContain('mergeGuideHeaderForSave(payload.header, adminHeaderSource)')
    expect(actions).toContain('pickAdminHeaderFields(coreLoad.settlement)')
  })
})

describe('save phase 1 regression suites remain', () => {
  it('child item idempotency suite remains', () => {
    expect(readRepoFile('src/lib/settlement/child-item-save-idempotency.test.ts')).toContain(
      'child item save idempotency',
    )
  })

  it('option item persist suite remains', () => {
    expect(readRepoFile('src/lib/settlement/option-item-persist.test.ts')).toContain(
      'option item persist',
    )
  })

  it('duplicate settlement guard remains in upsertSettlement', () => {
    const actions = readRepoFile('src/lib/actions/settlementActions.ts')
    expect(actions).toContain('SETTLEMENT_DUPLICATE_TOUR_ERROR')
    expect(actions).toContain('findExistingSettlementForTour')
  })
})
