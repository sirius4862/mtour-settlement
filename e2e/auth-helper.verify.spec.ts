import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'
import { getTestCreds, loadEnvLocal } from './helpers/env'

loadEnvLocal()
const creds = getTestCreds()

test('auth helper — UI login (guide)', async ({ page }) => {
  await login(page, creds.guide.email, creds.guide.password)
  await expect(page).toHaveURL(/\/guide/)
})
