import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(process.cwd())

describe('SettlementFormFooter loading states', () => {
  it('uses action-specific pendingAction instead of one shared pending flag', () => {
    const footer = readFileSync(
      join(ROOT, 'src/components/settlement/SettlementFormFooter.tsx'),
      'utf8',
    )
    expect(footer).toContain('pendingAction?:')
    expect(footer).toContain("pendingAction === 'save' ? '저장 중…'")
    expect(footer).toContain("pendingAction === 'send' ? '처리 중…'")
    expect(footer).not.toMatch(/pending \? '저장 중…'/)
    expect(footer).not.toMatch(/pending \? '처리 중…'/)
  })

  it('SettlementForm tracks save and process actions separately', () => {
    const form = readFileSync(join(ROOT, 'src/components/settlement/SettlementForm.tsx'), 'utf8')
    expect(form).toContain("useState<'save' | 'send' | 'submit' | null>(null)")
    expect(form).toContain("setPendingAction('save')")
    expect(form).toContain("setPendingAction('send')")
    expect(form).toContain('pendingAction={pendingAction}')
    expect(form).not.toContain('setPending(true)')
  })
})
