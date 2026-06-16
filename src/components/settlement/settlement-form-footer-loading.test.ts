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
    const saveIntegrity = readFileSync(
      join(ROOT, 'src/lib/settlement/save-integrity.ts'),
      'utf8',
    )
    expect(footer).toContain('pendingAction?:')
    expect(footer).toContain('footerStatusLabel')
    expect(saveIntegrity).toContain("pendingAction === 'save'")
    expect(saveIntegrity).toContain("pendingAction === 'send') return '처리 중…'")
    expect(saveIntegrity).toContain("pendingAction !== 'submit'")
  })

  it('SettlementForm tracks save and process actions separately', () => {
    const form = readFileSync(join(ROOT, 'src/components/settlement/SettlementForm.tsx'), 'utf8')
    expect(form).toContain("useState<'save' | 'send' | 'submit' | 'request_edit' | null>(null)")
    expect(form).toContain("setPendingAction('save')")
    expect(form).toContain("setPendingAction('send')")
    expect(form).toContain('pendingAction={pendingAction}')
    expect(form).not.toContain('setPending(true)')
    expect(form).toContain('saveInFlightRef')
  })
})
