import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import type { BrowserContext } from '@playwright/test'
import { PROD_URL } from './env'

type CookieToSet = {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  sameSite: 'Lax' | 'Strict' | 'None'
}

export async function buildSupabaseAuthCookies(
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string,
): Promise<CookieToSet[]> {
  const authClient = createClient(supabaseUrl, anonKey)
  const { data, error } = await authClient.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw new Error(`Auth failed for ${email}: ${error?.message ?? 'no session'}`)
  }

  const pending: { name: string; value: string }[] = []
  const serverClient = createServerClient(supabaseUrl, anonKey, {
    cookieEncoding: 'base64url',
    cookies: {
      getAll: () => [],
      setAll: (cookies) => {
        pending.length = 0
        pending.push(...cookies.map((c) => ({ name: c.name, value: c.value })))
      },
    },
  })

  const { error: sessionErr } = await serverClient.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  })
  if (sessionErr) throw new Error(sessionErr.message)
  if (!pending.length) throw new Error('No auth cookies emitted by Supabase SSR client')

  const domain = new URL(PROD_URL).hostname
  const secure = !domain.includes('localhost') && domain !== '127.0.0.1'

  return pending.map((c) => ({
    name: c.name,
    value: c.value,
    domain,
    path: '/',
    secure,
    sameSite: 'Lax',
  }))
}

export async function primeRole(
  context: BrowserContext,
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string,
) {
  await context.clearCookies()
  const cookies = await buildSupabaseAuthCookies(supabaseUrl, anonKey, email, password)
  await context.addCookies(cookies)
}
