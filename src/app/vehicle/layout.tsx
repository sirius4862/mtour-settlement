import { requireVehicleCompany, signOutAction } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function VehicleLayout({ children }: { children: React.ReactNode }) {
  const session = await requireVehicleCompany()

  return (
    <div className="min-h-screen bg-[#fdfaf3]">
      <header className="sticky top-0 z-40 bg-white border-b border-orange-100">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center shrink-0">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M2 10V6.5L3.5 4h7L12 6.5V10M2 10h10M2 10v1.5M12 10v1.5M4 10v.5M10 10v.5"
                  stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="font-semibold text-gray-800 text-sm truncate">차량회사 리포트</span>
          </div>
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

      <main className="max-w-3xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
