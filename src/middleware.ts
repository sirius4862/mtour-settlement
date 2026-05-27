import { NextResponse } from 'next/server'

/**
 * TEMP: Middleware disabled for Vercel (MIDDLEWARE_INVOCATION_FAILED).
 * Auth and role routing live in layouts/pages via requireAuth/requireGuide/requireAdmin.
 * Re-enable Supabase session refresh here once the edge runtime issue is resolved.
 */
export function middleware() {
  return NextResponse.next()
}

export const config = {
  matcher: [],
}
