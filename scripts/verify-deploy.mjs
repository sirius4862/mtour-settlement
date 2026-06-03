#!/usr/bin/env node
/**
 * Post-deploy verification: compare git HEAD to production NEXT_PUBLIC_GIT_SHA, run Playwright smoke.
 *
 * Requires .env.local: WORKFLOW_TEST_* + NEXT_PUBLIC_SUPABASE_* credentials.
 * Production must be redeployed after next.config exposes NEXT_PUBLIC_GIT_SHA.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function loadEnvLocal() {
  const p = join(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
}

loadEnvLocal()

const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
if (head.status !== 0) {
  console.error('git rev-parse HEAD failed')
  process.exit(1)
}
const expectedSha = head.stdout.trim()
console.log(`=== verify:deploy ===`)
console.log(`Expected git HEAD: ${expectedSha}`)
console.log(`Prod URL: ${process.env.PROD_SMOKE_URL || 'https://mtour-settlement.vercel.app'}\n`)

const install = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['playwright', 'install', 'chromium'],
  { stdio: 'inherit', shell: process.platform === 'win32' },
)
if (install.status !== 0) process.exit(install.status ?? 1)

const run = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['playwright', 'test', '-c', 'e2e/playwright.config.ts'],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      EXPECTED_GIT_SHA: expectedSha,
      PROD_SMOKE_URL:
        process.env.PROD_SMOKE_URL?.trim() || 'https://mtour-settlement.vercel.app',
    },
  },
)

process.exit(run.status ?? 1)
