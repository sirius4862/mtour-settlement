import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type AreaResult = 'PASS' | 'FAIL' | 'INCONCLUSIVE'

const REPORT_PATH = join(process.cwd(), 'test-results', 'deploy-report.json')

export interface AreaRow {
  area: string
  result: AreaResult
  detail: string
  screenshot?: string
}

export class DeployReport {
  deploymentSha = process.env.EXPECTED_GIT_SHA?.trim() || '(unknown)'
  testedUrl = process.env.PROD_SMOKE_URL?.trim() || 'https://mtour-settlement.vercel.app'
  prodDeploySha = '(not read)'
  rolesTested: string[] = []
  rows: AreaRow[] = []

  setProdSha(sha: string) {
    this.prodDeploySha = sha || '(empty)'
    this.persist()
  }

  private persist() {
    mkdirSync(join(process.cwd(), 'test-results'), { recursive: true })
    writeFileSync(
      REPORT_PATH,
      JSON.stringify({
        deploymentSha: this.deploymentSha,
        testedUrl: this.testedUrl,
        prodDeploySha: this.prodDeploySha,
        rolesTested: this.rolesTested,
        rows: this.rows,
      }),
    )
  }

  pass(area: string, detail: string) {
    this.rows.push({ area, result: 'PASS', detail })
    this.persist()
  }

  fail(area: string, detail: string, screenshot?: string) {
    this.rows.push({ area, result: 'FAIL', detail, screenshot })
    this.persist()
  }

  inconclusive(area: string, detail: string) {
    this.rows.push({ area, result: 'INCONCLUSIVE', detail })
    this.persist()
  }

  role(name: string) {
    if (!this.rolesTested.includes(name)) this.rolesTested.push(name)
  }

  print() {
    const fails = this.rows.filter((r) => r.result === 'FAIL')
    console.log('\n========== PRODUCTION SMOKE REPORT ==========')
    console.log(`Deployment SHA (expected): ${this.deploymentSha}`)
    console.log(`Deployment SHA (production): ${this.prodDeploySha}`)
    console.log(`Tested URL:                  ${this.testedUrl}`)
    console.log(`Roles tested:                ${this.rolesTested.join(', ') || '(none)'}`)
    console.log('')
    console.log('| Area | Result | Detail |')
    console.log('|------|--------|--------|')
    for (const r of this.rows) {
      console.log(`| ${r.area} | ${r.result} | ${r.detail.replace(/\|/g, '/')} |`)
      if (r.screenshot) console.log(`  screenshot: ${r.screenshot}`)
    }
    console.log('')
    console.log(
      fails.length
        ? `OVERALL: FAIL (${fails.length} area(s))`
        : 'OVERALL: PASS',
    )
    console.log('============================================\n')
  }

  exitCode() {
    return this.rows.some((r) => r.result === 'FAIL') ? 1 : 0
  }
}

export function loadPersistedReport(): DeployReport | null {
  if (!existsSync(REPORT_PATH)) return null
  try {
    const data = JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as DeployReport
    return data
  } catch {
    return null
  }
}

export const deployReport = new DeployReport()
