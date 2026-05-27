import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export function createMiddlewareClient(req: NextRequest, res: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list: { name: string; value: string; options?: Parameters<NextResponse['cookies']['set']>[2] }[]) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value))
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        },
      },
    },
  )
}
