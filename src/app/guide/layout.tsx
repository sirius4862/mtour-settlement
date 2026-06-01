import Link from 'next/link'
import { requireGuide, signOutAction } from '@/lib/auth/session'
import { GuideBottomNav } from '@/components/guide/GuideBottomNav'

export default async function GuideLayout({ children }: { children: React.ReactNode }) {
  const session = await requireGuide()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/guide" className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 3.5h10M2 6h7M3 3.5v8.5h8V3.5" stroke="white" strokeWidth="1.25" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="font-semibold text-gray-800 text-sm truncate">M투어 정산</span>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-500 hidden sm:block">{session.full_name}</span>
            <form action={signOutAction}>
              <button type="submit" className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="pb-20 max-w-lg mx-auto">
        {children}
      </main>

      <GuideBottomNav />
    </div>
  )
}
