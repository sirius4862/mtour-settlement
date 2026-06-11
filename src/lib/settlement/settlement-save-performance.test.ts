import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(process.cwd())

function readRepoFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

describe('settlement save performance and stability (source-level)', () => {
  it('saveSettlementDraft uses one post-save getSettlementFull for sync and calc summary', () => {
    const source = readRepoFile('src/lib/actions/settlementActions.ts')
    const start = source.indexOf('export async function saveSettlementDraft')
    const end = source.indexOf('export async function saveAdminSettlementEdits', start)
    const body = source.slice(start, end)

    expect(body).toContain('persistSettlementLineItems(')
    expect(body).not.toContain('saveSettlementItems(')
    expect(body).toContain('load_post_save_full')
    expect(body).toContain('persistSettlementCalcSummary(supabase, headerResult.id, full)')
    expect(body).toContain("logSettlementSaveTimings('[saveSettlementDraft] timings'")
    expect((body.match(/getSettlementFull\(/g) ?? []).length).toBe(2)
  })

  it('guide line-item persist keeps batched known-id delete and avoids unsafe bulk patterns', () => {
    const persist = readRepoFile('src/lib/settlement/guide-line-item-persist.ts')
    expect(persist).toContain(".in('id', chunk)")
    expect(persist).not.toContain(".not('id', 'in'")
    expect(persist).not.toContain('count:')
    expect(persist).toContain('filterRowsNeedingUpdate')
  })

  it('admin company_expense_items uses admin-only delete path, not guide tables', () => {
    const source = readRepoFile('src/lib/actions/settlementActions.ts')
    const companyFn = source.match(
      /async function persistCompanyExpenseItems[\s\S]*?\n\}/,
    )
    expect(companyFn).toBeTruthy()
    expect(companyFn![0]).toContain('company_expense_items')
    const guidePersist = readRepoFile('src/lib/settlement/guide-line-item-persist.ts')
    expect(guidePersist).not.toContain('company_expense_items')
  })

  it('SettlementForm prevents overlapping save calls', () => {
    const form = readRepoFile('src/components/settlement/SettlementForm.tsx')
    expect(form).toContain('saveInFlightRef')
    expect(form).toContain('if (saveInFlightRef.current) return false')
    expect(form).toContain('saveInFlightRef.current = true')
    expect(form).toContain('saveInFlightRef.current = false')
    expect(form).toContain('if (saveInFlightRef.current || pendingAction !== null) return')
  })

  it('save-before-submit still propagates specific errors', () => {
    const flow = readRepoFile('src/lib/settlement/submit-flow.ts')
    expect(flow).toContain('saved.error ?? SAVE_BEFORE_SUBMIT_FALLBACK')
    expect(flow).toContain('logSubmitFlowAction')
  })

  it('negative company deposit policy tests remain in suite', () => {
    expect(readRepoFile('src/lib/settlement/negative-company-deposit-policy.test.ts')).toContain(
      'negative company deposit policy',
    )
  })

  it('child item idempotency suite remains in suite', () => {
    expect(readRepoFile('src/lib/settlement/child-item-save-idempotency.test.ts')).toContain(
      'child item save idempotency',
    )
  })
})
