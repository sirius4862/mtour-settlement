import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

export async function requireAuth() {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

export async function requireGuide() {
  const session = await requireAuth()
  if (!['guide', 'admin', 'staff'].includes(session.role)) redirect('/login')
  return session
}

export async function requireAdmin() {
  const session = await requireAuth()
  if (!['admin', 'staff'].includes(session.role)) redirect('/guide')
  return session
}

export async function signOutAction() {
  'use server'
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
