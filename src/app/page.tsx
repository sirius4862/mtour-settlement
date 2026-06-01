import { redirect } from 'next/navigation'
import { isAdminTier } from '@/lib/auth/permissions'
import { getSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (isAdminTier(session.role)) redirect('/admin')
  redirect('/guide')
}
