import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccessAdminRoutes, canAccessGuideRoutes, homePathForRole } from '@/lib/auth/permissions'
import type { UserRole } from '@/types'

export async function getSession() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, branch_id, email')
    .eq('id', user.id)
    .single()

  return profile as {
    id: string; full_name: string; role: UserRole
    branch_id: string | null; email: string
  } | null
}

export type AdminSession = NonNullable<Awaited<ReturnType<typeof getSession>>>

export async function requireAuth() {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

/** Guide routes — guide role only. */
export async function requireGuide() {
  const session = await requireAuth()
  if (!canAccessGuideRoutes(session.role)) {
    redirect(homePathForRole(session.role))
  }
  return session
}

/** Admin routes — admin and master_admin. */
export async function requireAdmin() {
  const session = await requireAuth()
  if (!canAccessAdminRoutes(session.role)) {
    redirect('/guide')
  }
  return session
}

/** Payment and other master-admin-only server actions. */
export async function requireMasterAdmin() {
  const session = await requireAuth()
  if (session.role !== 'master_admin') {
    redirect(canAccessAdminRoutes(session.role) ? '/admin' : '/guide')
  }
  return session
}

export async function signOutAction() {
  'use server'
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
