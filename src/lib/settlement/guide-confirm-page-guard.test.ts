import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Structural regression for the guide /confirm page hardening (tour 260426 desync).
 * The page is an async server component, so we assert on its source: it must show a
 * recovery message for the desync case instead of unconditionally redirecting back to
 * the detail page (which previously created a dead-end loop with no confirm button).
 */
const CONFIRM_PAGE = readFileSync(
  join(process.cwd(), 'src/app/guide/settlements/[id]/confirm/page.tsx'),
  'utf8',
)

describe('guide confirm page guard', () => {
  it('renders the ConfirmPanel (buttons) for a healthy pending packet', () => {
    expect(CONFIRM_PAGE).toContain('<ConfirmPanel')
  })

  it('shows a recovery message instead of silently redirecting on desync', () => {
    expect(CONFIRM_PAGE).toContain('확인 요청 상태가 일치하지 않습니다. 관리자에게 재요청을 요청해 주세요.')
    expect(CONFIRM_PAGE).toContain('<ConfirmUnavailable')
  })

  it('only reaches the recovery branch when guide is still prompted (pending + unconfirmed)', () => {
    // The recovery render must be gated on pending_guide_confirmation && guide_confirmed_at == null
    expect(CONFIRM_PAGE).toMatch(
      /full\.status === 'pending_guide_confirmation'\s*&&\s*full\.guide_confirmed_at == null/,
    )
  })

  it('does not unconditionally redirect when the packet is missing', () => {
    // The redirect must come after the desync guard, not as the first action in the !packet block.
    const block = CONFIRM_PAGE.slice(CONFIRM_PAGE.indexOf('if (!packet)'))
    const guardIdx = block.indexOf("full.status === 'pending_guide_confirmation'")
    const redirectIdx = block.indexOf('redirect(`/guide/settlements/${id}`)')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(redirectIdx).toBeGreaterThan(guardIdx)
  })
})
