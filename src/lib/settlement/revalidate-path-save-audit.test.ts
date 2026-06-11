import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(process.cwd())

function readRepoFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

/**
 * Phase 1 audit only — no revalidatePath removals in this pass.
 */
describe('revalidatePath save-path audit (report-only)', () => {
  const actions = readRepoFile('src/lib/actions/settlementActions.ts')

  it('documents saveSettlementDraft revalidatePath calls', () => {
    const draftBody = actions.slice(
      actions.indexOf('export async function saveSettlementDraft'),
      actions.indexOf('export async function saveAdminSettlementEdits'),
    )
    expect(draftBody).toContain("revalidatePath('/guide/settlements')")
    expect(draftBody).toContain('revalidatePath(`/guide/settlements/${headerResult.id}`)')
    expect(draftBody).toContain('revalidatePath(`/guide/settlements/${headerResult.id}/edit`)')
    expect((draftBody.match(/revalidatePath\(/g) ?? []).length).toBe(3)
  })

  it('documents upsertSettlement list revalidation (create path only)', () => {
    const upsertBody = actions.slice(
      actions.indexOf('export async function upsertSettlement'),
      actions.indexOf('// ── 제출'),
    )
    expect(upsertBody).toContain("revalidatePath('/guide/settlements')")
    expect((upsertBody.match(/revalidatePath\(/g) ?? []).length).toBe(1)
  })

  it('documents broader revalidateSettlementPaths helper for workflow actions', () => {
    expect(actions).toContain('function revalidateSettlementPaths(id: string)')
    expect(actions).toContain("revalidatePath(`/guide/settlements/${id}/confirm`)")
    expect(actions).toContain("revalidatePath('/admin/settlements')")
  })

  it('flags potential redundancy: upsertSettlement + saveSettlementDraft both hit list path', () => {
    const draftBody = actions.slice(
      actions.indexOf('export async function saveSettlementDraft'),
      actions.indexOf('export async function saveAdminSettlementEdits'),
    )
    const upsertBody = actions.slice(
      actions.indexOf('export async function upsertSettlement'),
      actions.indexOf('// ── 제출'),
    )
    expect(draftBody).toContain("revalidatePath('/guide/settlements')")
    expect(upsertBody).toContain("revalidatePath('/guide/settlements')")
  })
})
