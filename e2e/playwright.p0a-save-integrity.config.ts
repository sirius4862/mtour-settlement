import { defineConfig, devices } from '@playwright/test'
import { loadEnvLocal } from './helpers/env'

loadEnvLocal()

const baseURL = process.env.P0A_E2E_BASE_URL?.trim() || 'http://127.0.0.1:3000'

export default defineConfig({
  testDir: '.',
  testMatch: ['p0a-save-integrity.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  outputDir: '../test-results/p0a-save-integrity',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
})
