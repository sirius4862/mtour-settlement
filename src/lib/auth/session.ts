import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  canAccessAdminRoutes,
  canAccessGuideRoutes,
  canAccessVehicleRoutes,
  homePathForRole,
} from '@/lib/auth/permissions'
import { timed } from '@/lib/server/perf'
import type { UserRole } from '@/types'

/** Request-scoped cache — layout + page + loaders share one auth/profile round-trip per render. */
export const getSession = cache(async function getSession() {
  const supabase = await createClient()
  const { data: { user } } = await timed('auth/session', () => supabase.auth.getUser())
  if (!user) return null

  const { data: profile } = await timed('profile/role/branch', () =>
    supabase
      .from('profiles')
      .select('id, full_name, role, branch_id, email')
      .eq('id', user.id)
      .single(),
  )

  return profile as {
    id: string; full_name: string; role: UserRole
    branch_id: string | null; email: string
  } | null
})

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
    redirect(homePathForRole(session.role))
  }
  return session
}

/** Payment and other master-admin-only server actions. */
export async function requireMasterAdmin() {
  const session = await requireAuth()
  if (session.role !== 'master_admin') {
    redirect(canAccessAdminRoutes(session.role) ? '/admin' : homePathForRole(session.role))
  }
  return session
}

/** Vehicle company operations routes (/vehicle) — vehicle_company role only. */
export async function requireVehicleCompany() {
  const session = await requireAuth()
  if (!canAccessVehicleRoutes(session.role)) {
    redirect(homePathForRole(session.role))
  }
  return session
}

export async function signOutAction() {
  'use server'
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
