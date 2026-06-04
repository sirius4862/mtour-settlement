import { defineConfig, devices } from '@playwright/test'
import { loadEnvLocal } from './helpers/env'

loadEnvLocal()

const port = process.env.GUIDE_SUBMIT_E2E_PORT?.trim() || '3006'
const baseURL = process.env.GUIDE_SUBMIT_E2E_BASE_URL?.trim() || `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: '.',
  testMatch: ['guide-save-then-submit.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  outputDir: '../test-results/guide-save-then-submit',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run build && npm run start -- -p ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300_000,
  },
})
