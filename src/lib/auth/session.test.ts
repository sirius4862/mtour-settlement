import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  canAccessGuideRoutes,
  homePathForRole,
} from '@/lib/auth/permissions'

const ROOT = process.cwd()

describe('guide auth session caching', () => {
  it('dedupes auth/profile via React.cache on getSession', () => {
    const sessionSrc = readFileSync(join(ROOT, 'src/lib/auth/session.ts'), 'utf8')
    expect(sessionSrc).toContain("import { cache } from 'react'")
    expect(sessionSrc).toContain('export const getSession = cache(async function getSession()')
  })

  it('keeps guide layout as the authorization gate', () => {
    const layout = readFileSync(join(ROOT, 'src/app/guide/layout.tsx'), 'utf8')
    expect(layout).toContain('requireGuide')
    expect(layout).toMatch(/await requireGuide\(\)/)
  })

  it('guide dashboard page relies on layout auth and cached getSession', () => {
    const page = readFileSync(join(ROOT, 'src/app/guide/page.tsx'), 'utf8')
    expect(page).toContain('getSession')
    expect(page).not.toMatch(/await requireGuide\(\)/)
  })

  it('vehicle guide loader uses cached getSession instead of duplicate auth', () => {
    const actions = readFileSync(join(ROOT, 'src/lib/actions/vehicleGuideActions.ts'), 'utf8')
    const ctxStart = actions.indexOf('async function getGuideCtx')
    const ctxEnd = actions.indexOf('async function fetchSubmittedReportsForTours', ctxStart)
    const ctxBody = actions.slice(ctxStart, ctxEnd)

    expect(ctxBody).toContain('getSession()')
    expect(ctxBody).not.toContain('auth.getUser()')
  })

  it('blocks non-guide roles from guide routes via requireGuide', () => {
    expect(canAccessGuideRoutes('guide')).toBe(true)
    expect(canAccessGuideRoutes('admin')).toBe(false)
    expect(canAccessGuideRoutes('master_admin')).toBe(false)
    expect(canAccessGuideRoutes('vehicle_company')).toBe(false)
    expect(homePathForRole('admin')).toBe('/admin')
    expect(homePathForRole('vehicle_company')).toBe('/vehicle')
  })
})
