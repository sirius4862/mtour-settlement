import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveCallbackRedirect } from '@/lib/auth/safe-redirect'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Absent `next` keeps legacy post-login behavior (→ /guide); any provided
  // value is sanitized so unsafe/external targets fall back to `/`.
  const next = resolveCallbackRedirect(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(new URL(next, origin))
}
