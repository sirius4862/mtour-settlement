import Link from 'next/link'
import { requireGuide, signOutAction } from '@/lib/auth/session'

export default async function GuideLayout({ children }: { children: React.ReactNode }) {
  const session = await requireGuide()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 상단 헤더 */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 3.5h10M2 6h7M3 3.5v8.5h8V3.5" stroke="white" strokeWidth="1.25" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="font-semibold text-gray-800 text-sm">M투어 정산</span>
            {(session.role === 'admin' || session.role === 'staff') && (
              <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
                관리자
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 hidden sm:block">{session.full_name}</span>
            {(session.role === 'admin' || session.role === 'staff') && (
              <Link href="/admin"
                className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                관리자
              </Link>
            )}
            <form action={signOutAction}>
              <button className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="pb-20 max-w-lg mx-auto">
        {children}
      </main>

      {/* 하단 탭 */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 pb-safe">
        <div className="max-w-lg mx-auto flex">
          {[
            { href: '/guide', label: '홈', icon: '🏠' },
            { href: '/guide/settlements', label: '정산서', icon: '📋' },
            { href: '/guide/settlements/new', label: '새 작성', icon: '✏️' },
          ].map(({ href, label, icon }) => (
            <Link key={href} href={href}
              className="flex-1 flex flex-col items-center py-2.5 text-gray-400 hover:text-blue-600 transition-colors">
              <span className="text-lg leading-none">{icon}</span>
              <span className="text-[10px] mt-0.5 font-medium">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}
