import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  allGuideReadSelectsPassed,
  GUIDE_READ_SELECT_CHECKS,
  supabaseProjectRefFromUrl,
  validateGuideReadSelectsLive,
} from './guide-read-select-validation'

function loadEnvLocal() {
  const p = join(process.cwd(), '.env.local')
  if (!existsSync(p)) return false
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '')
    }
  }
  return true
}

function hasLiveGuideReadEnv(): boolean {
  loadEnvLocal()
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() &&
    process.env.WORKFLOW_TEST_GUIDE_EMAIL?.trim() &&
    process.env.WORKFLOW_TEST_GUIDE_PASSWORD
  )
}

const liveEnabled = hasLiveGuideReadEnv()

describe('guide-read SELECT live validation (read-only)', () => {
  it.skipIf(!liveEnabled)(
    'SELECT … LIMIT 0 against every *_guide_read view used by getSettlementFull',
    async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim()
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim()
      const email = process.env.WORKFLOW_TEST_GUIDE_EMAIL!.trim()
      const password = process.env.WORKFLOW_TEST_GUIDE_PASSWORD!

      const projectRef = supabaseProjectRefFromUrl(url)
      expect(projectRef).toBeTruthy()

      const client = createClient(url, anonKey)
      const { error: signInErr } = await client.auth.signInWithPassword({ email, password })
      expect(signInErr, `guide sign-in failed: ${signInErr?.message}`).toBeNull()

      const results = await validateGuideReadSelectsLive(client)
      expect(results).toHaveLength(GUIDE_READ_SELECT_CHECKS.length)

      const failures = results.filter((r) => !r.ok)
      if (failures.length > 0) {
        const detail = failures
          .map((f) => `${f.view}: ${f.error}\n  select: ${f.select}`)
          .join('\n')
        expect.fail(
          `Guide-read SELECT compatibility failed on project ${projectRef}:\n${detail}`,
        )
      }

      expect(allGuideReadSelectsPassed(results)).toBe(true)

      await client.auth.signOut()
    },
    30_000,
  )

  it('documents live probe requirement when env is absent', () => {
    if (liveEnabled) {
      expect(GUIDE_READ_SELECT_CHECKS.length).toBe(8)
      return
    }
    expect(liveEnabled).toBe(false)
  })
})
