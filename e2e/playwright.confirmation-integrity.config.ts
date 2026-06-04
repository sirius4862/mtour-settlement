import { defineConfig, devices } from '@playwright/test'
import { loadEnvLocal } from './helpers/env'

loadEnvLocal()

const port = process.env.CONFIRMATION_E2E_PORT?.trim() || '3005'
const baseURL = process.env.CONFIRMATION_E2E_BASE_URL?.trim() || `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: '.',
  testMatch: ['guide-confirmation-integrity.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  outputDir: '../test-results/confirmation-integrity',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run build && npm run start -- -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
