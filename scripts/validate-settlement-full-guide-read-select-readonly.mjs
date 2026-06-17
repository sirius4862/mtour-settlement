#!/usr/bin/env node
/**
 * READ-ONLY wrapper — runs live guide-read SELECT validation via vitest.
 * See guide-read-select-validation.live.test.ts for probe details.
 */
import { spawnSync } from 'node:child_process'

const result = spawnSync(
  'npx',
  ['vitest', 'run', 'src/lib/settlement/guide-read-select-validation.live.test.ts'],
  { stdio: 'inherit', shell: true, cwd: process.cwd() },
)

process.exit(result.status === null ? 1 : result.status)
