import Link from 'next/link'
import { requireAdmin, signOutAction } from '@/lib/auth/session'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1l1.5 3 3.5.5-2.5 2.5.5 3.5L7 9l-3 1.5.5-3.5L2 4.5 5.5 4z"
                  fill="white"/>
              </svg>
            </div>
            <span className="font-semibold text-gray-800 text-sm">관리자</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium uppercase">
              {session.role}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 hidden sm:block">{session.full_name}</span>
            <Link href="/guide" className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
              가이드 화면
            </Link>
            <form action={signOutAction}>
              <button className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* 서브 네비 */}
      <nav className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 flex gap-1">
          {[
            { href: '/admin', label: '대시보드' },
            { href: '/admin/tours', label: '투어 관리' },
            { href: '/admin/settlements', label: '정산서 목록' },
          ].map(({ href, label }) => (
            <Link key={href} href={href}
              className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition-colors">
              {label}
            </Link>
          ))}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-5">
        {children}
      </main>
    </div>
  )
}
