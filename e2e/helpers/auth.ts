import type { Page } from '@playwright/test'

export async function login(
  page: Page,
  email: string,
  password: string,
  options?: { next?: string },
) {
  const next = options?.next ? `?next=${encodeURIComponent(options.next)}` : ''
  await page.goto(`/login${next}`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('이메일').fill(email)
  await page.getByLabel('비밀번호').fill(password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60_000 }).catch(async () => {
    const err = await page.locator('.text-red-400').first().textContent().catch(() => null)
    if (err) throw new Error(`Login failed: ${err}`)
    throw new Error(`Still on login after 60s (url=${page.url()})`)
  })
}

export async function loginAsAdmin(page: Page, email: string, password: string) {
  await login(page, email, password, { next: '/admin' })
  if (!page.url().includes('/admin')) {
    await page.goto('/admin')
  }
  await page.waitForURL(/\/admin/, { timeout: 30_000 })
}

export async function loginAsGuide(page: Page, email: string, password: string) {
  await login(page, email, password)
  if (!page.url().includes('/guide')) {
    await page.goto('/guide')
  }
  await page.waitForURL(/\/guide/, { timeout: 30_000 })
}
