import { defineConfig, devices } from '@playwright/test'
import { loadEnvLocal } from './helpers/env'

loadEnvLocal()

const baseURL = process.env.PROD_SMOKE_URL?.trim() || 'https://mtour-settlement.vercel.app'

export default defineConfig({
  testDir: '.',
  testMatch: ['prod-smoke.spec.ts', 'auth-helper.verify.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['./reporters/deploy-reporter.ts']],
  outputDir: '../test-results/prod-smoke',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
})
