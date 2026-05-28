'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/guide', label: '홈', icon: '🏠', exact: true },
  { href: '/guide/settlements', label: '정산서', icon: '📋', exact: false },
] as const

export function GuideBottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 pb-safe">
      <div className="max-w-lg mx-auto flex">
        {TABS.map(({ href, label, icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center py-2.5 transition-colors ${
                active ? 'text-blue-600' : 'text-gray-400 hover:text-blue-600'
              }`}
            >
              <span className="text-lg leading-none">{icon}</span>
              <span className="text-[10px] mt-0.5 font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
