import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function loadEnvLocal() {
  const p = join(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim()
    }
  }
}

export function requireEnv(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`Missing ${name} (set in .env.local for prod smoke)`)
  return v
}

export function getTestCreds() {
  return {
    guide: {
      email: requireEnv('WORKFLOW_TEST_GUIDE_EMAIL'),
      password: requireEnv('WORKFLOW_TEST_GUIDE_PASSWORD'),
    },
    admin: {
      email: requireEnv('WORKFLOW_TEST_ADMIN_EMAIL'),
      password: requireEnv('WORKFLOW_TEST_ADMIN_PASSWORD'),
    },
    master: {
      email: requireEnv('WORKFLOW_TEST_MASTER_EMAIL'),
      password: requireEnv('WORKFLOW_TEST_MASTER_PASSWORD'),
    },
  }
}

export function getSupabaseEnv() {
  return {
    url: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  }
}

export const PROD_URL =
  process.env.PROD_SMOKE_URL?.trim() || 'https://mtour-settlement.vercel.app'

export const CARD_LABELS = ['미제출', '제출됨', '최종확인', '수정요청', '지급완료'] as const

export {
  PRODUCTION_SUPABASE_REF,
  assertLegacyProductionWorkflowSupabase,
  assertStagingSupabaseNotProduction,
  extractSupabaseProjectRef,
  isProductionSupabaseRef,
} from '../../src/lib/supabase/project-ref'
