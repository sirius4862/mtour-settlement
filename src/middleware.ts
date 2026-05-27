import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|auth/callback).*)',
  ],
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => request.cookies.getAll(),
        setAll: (list: { name: string; value: string; options?: Parameters<NextResponse['cookies']['set']>[2] }[]) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value))
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = !!user

  if (process.env.NODE_ENV === 'development') {
    console.log(`[MW] ${pathname} | loggedIn=${isLoggedIn} | uid=${user?.id?.slice(0, 8) ?? 'none'}`)
  }

  // /login
  if (pathname === '/login') {
    if (!isLoggedIn) return response
    const role = await getRole(supabase, user.id)
    return NextResponse.redirect(new URL(roleHome(role), request.url))
  }

  // 비로그인 → /login
  if (!isLoggedIn) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // 루트 / → 역할별 홈
  if (pathname === '/') {
    const role = await getRole(supabase, user.id)
    return NextResponse.redirect(new URL(roleHome(role), request.url))
  }

  // /admin → admin/staff만 허용
  if (pathname.startsWith('/admin')) {
    const role = await getRole(supabase, user.id)
    if (role !== 'admin' && role !== 'staff') {
      return NextResponse.redirect(new URL('/guide', request.url))
    }
    return response
  }

  // /guide 및 그 외 → 조건 없이 통과
  return response
}

async function getRole(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<'guide' | 'admin' | 'staff'> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('[MW] getRole error:', error.message)
      return 'guide'
    }

    if (!data) {
      console.warn('[MW] getRole: profiles row not found for uid:', userId)
      return 'guide'
    }

    const role = data.role as string
    if (role === 'admin' || role === 'staff') return role
    return 'guide'

  } catch (err) {
    console.error('[MW] getRole unexpected error:', err)
    return 'guide'
  }
}

function roleHome(role: 'guide' | 'admin' | 'staff'): string {
  return (role === 'admin' || role === 'staff') ? '/admin' : '/guide'
}