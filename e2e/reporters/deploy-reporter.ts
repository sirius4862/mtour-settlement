import type { FullConfig, FullResult, Reporter } from '@playwright/test/reporter'
import { deployReport, loadPersistedReport } from '../helpers/report'

class DeployReporter implements Reporter {
  onEnd(_result: FullResult) {
    const persisted = loadPersistedReport()
    if (persisted) {
      deployReport.deploymentSha = persisted.deploymentSha
      deployReport.testedUrl = persisted.testedUrl
      deployReport.prodDeploySha = persisted.prodDeploySha
      deployReport.rolesTested = persisted.rolesTested
      deployReport.rows = persisted.rows
    }
    deployReport.deploymentSha =
      process.env.EXPECTED_GIT_SHA?.trim() || deployReport.deploymentSha
    deployReport.testedUrl =
      process.env.PROD_SMOKE_URL?.trim() || deployReport.testedUrl
    deployReport.print()
  }

  onBegin(_config: FullConfig) {
    deployReport.deploymentSha = process.env.EXPECTED_GIT_SHA?.trim() || deployReport.deploymentSha
    deployReport.testedUrl =
      process.env.PROD_SMOKE_URL?.trim() || deployReport.testedUrl
  }
}

export default DeployReporter
