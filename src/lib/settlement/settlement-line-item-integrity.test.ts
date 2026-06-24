import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const ACTIONS = readFileSync(join(ROOT, 'src/lib/actions/settlementActions.ts'), 'utf8')

describe('settlement line-item load error propagation (static)', () => {
  it('loadSettlementLineItemRows records loadError instead of silent empty sections', () => {
    const start = ACTIONS.indexOf('async function loadSettlementLineItemRows')
    const end = ACTIONS.indexOf('function assembleSettlementFull', start)
    const body = ACTIONS.slice(start, end)
    expect(body).toContain('firstLineItemSectionLoadFailure')
    expect(body).toContain('loadError')
    expect(body).not.toMatch(/if \(error\) \{\s*console\.error[\s\S]*return \[\]/)
  })

  it('getSettlementFull returns null when line item load fails', () => {
    const start = ACTIONS.indexOf('export async function getSettlementFull')
    const end = ACTIONS.indexOf('function emptyAdminSettlementsPage', start)
    const body = ACTIONS.slice(start, end)
    expect(body).toContain('if (lineRows.loadError)')
    expect(body).toContain('return null')
  })

  it('saveSettlementDraft aborts before persist when pre-load fails', () => {
    const start = ACTIONS.indexOf('export async function saveSettlementDraft')
    const end = ACTIONS.indexOf('/** Admin/staff saves admin-owned fields', start)
    const body = ACTIONS.slice(start, end)
    const loadErrIdx = body.indexOf('if (lineRows.loadError)')
    const persistIdx = body.indexOf('persistSettlementLineItems(')
    expect(loadErrIdx).toBeGreaterThan(-1)
    expect(persistIdx).toBeGreaterThan(loadErrIdx)
    expect(body).toContain('SETTLEMENT_LINE_ITEM_LOAD_ERROR')
  })

  it('persistSettlementCalcSummary runs only after successful post-save reload', () => {
    const start = ACTIONS.indexOf('export async function saveSettlementDraft')
    const end = ACTIONS.indexOf('/** Admin/staff saves admin-owned fields', start)
    const body = ACTIONS.slice(start, end)
    const calcIdx = body.indexOf('persistSettlementCalcSummary(')
    const fullGuardIdx = body.indexOf('if (full) {')
    expect(calcIdx).toBeGreaterThan(fullGuardIdx)
  })
})

describe('guide line-item section hydration guards (static)', () => {
  it('persistSettlementLineItems checks assertGuideLineItemSectionsSaveAllowed when existing', () => {
    const start = ACTIONS.indexOf('async function persistSettlementLineItems')
    const end = ACTIONS.indexOf('/** Admin-only — guide save must never call this.', start)
    const body = ACTIONS.slice(start, end)
    expect(body).toContain('assertGuideLineItemSectionsSaveAllowed')
    expect(body).toContain('buildGuideLineItemDeleteIds')
  })
})

describe('saveAdminSettlementEdits optimistic header guard (static)', () => {
  it('asserts single-row header update before child writes', () => {
    const start = ACTIONS.indexOf('export async function saveAdminSettlementEdits')
    const end = ACTIONS.indexOf('export async function', start + 1)
    const body = ACTIONS.slice(start, end)
    const headerSelectIdx = body.indexOf(".select('id')")
    const rowCheckIdx = body.indexOf('assertSingleOptimisticUpdate(headerRows)')
    const persistIdx = body.indexOf('persistSettlementLineItems(')
    expect(headerSelectIdx).toBeGreaterThan(-1)
    expect(rowCheckIdx).toBeGreaterThan(headerSelectIdx)
    expect(persistIdx).toBeGreaterThan(rowCheckIdx)
  })
})
