import { type NextRequest, NextResponse } from 'next/server'
import { createMiddlewareClient } from '@/lib/supabase/middleware'

/** Middleware에서 통과시키는 경로 (세션 없어도 OK) */
const PUBLIC_PREFIXES = [
  '/login',
  '/auth/callback',
]

/** Migration routes — key-gated in route handler; no login bypass for other app routes */
const MIGRATION_API_PREFIXES = [
  '/api/internal/apply-external-receivable-migration',
  '/api/internal/apply-settlement-schema-migrations',
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

function isMigrationApiPath(pathname: string): boolean {
  return MIGRATION_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

/** getUser()로 갱신된 세션 쿠키를 redirect 응답에도 전달 */
function redirectWithSessionCookies(url: URL, sessionResponse: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url)
  sessionResponse.cookies.getAll().forEach(({ name, value }) => {
    redirect.cookies.set(name, value)
  })
  return redirect
}

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[MW] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
    return NextResponse.next({ request })
  }

  const sessionResponse = NextResponse.next({ request })
  const supabase = createMiddlewareClient(request, sessionResponse)

  // Edge-safe: JWT 검증 + 세션 쿠키 갱신만 (profiles DB 조회 금지)
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) {
    console.error('[MW] getUser error:', error.message)
  }

  const isLoggedIn = !!user
  const { pathname } = request.nextUrl

  // 로그인된 사용자가 /login 접근 → 가이드 홈 (역할 분기는 / 또는 admin 링크)
  if (pathname === '/login' && isLoggedIn) {
    return redirectWithSessionCookies(new URL('/', request.url), sessionResponse)
  }

  // 공개 경로
  if (isPublicPath(pathname)) {
    return sessionResponse
  }

  // Internal migration APIs — auth via MIGRATION_RUN_KEY in route handler (404 when unset)
  if (isMigrationApiPath(pathname)) {
    return sessionResponse
  }

  // 비로그인 → /login
  if (!isLoggedIn) {
    const loginUrl = new URL('/login', request.url)
    if (pathname !== '/') {
      loginUrl.searchParams.set('next', pathname)
    }
    return redirectWithSessionCookies(loginUrl, sessionResponse)
  }

  // 역할(admin/guide/staff) 확인은 admin/guide layout의 requireAdmin/requireGuide에서 처리
  return sessionResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
