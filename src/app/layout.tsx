import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'M투어 정산 시스템',
  description: '다낭 현지 가이드 정산 관리',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#1e40af',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const deploySha =
    process.env.NEXT_PUBLIC_GIT_SHA ||
    process.env.NEXT_PUBLIC_DEPLOY_SHA ||
    ''

  return (
    <html lang="ko">
      <body className="antialiased bg-gray-50 text-gray-900">
        <div id="deploy-meta" data-git-sha={deploySha} hidden aria-hidden="true" />
        {children}
      </body>
    </html>
  )
}
