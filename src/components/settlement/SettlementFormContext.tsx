'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { SettlementFormRole } from '@/lib/settlement/field-ownership'
import type { SummaryAudience } from '@/lib/settlement/display-labels'

const RoleContext = createContext<SettlementFormRole>('guide')
const AdminReviewContext = createContext(false)

export function SettlementFormProvider({
  role,
  adminReviewEdit = false,
  children,
}: {
  role: SettlementFormRole
  adminReviewEdit?: boolean
  children: ReactNode
}) {
  return (
    <RoleContext.Provider value={role}>
      <AdminReviewContext.Provider value={adminReviewEdit}>
        {children}
      </AdminReviewContext.Provider>
    </RoleContext.Provider>
  )
}

export function useSettlementFormRole(): SettlementFormRole {
  return useContext(RoleContext)
}

export function useAdminReviewEdit(): boolean {
  return useContext(AdminReviewContext)
}

export function summaryAudienceFromRole(role: SettlementFormRole): SummaryAudience {
  return role === 'admin' ? 'admin' : 'guide'
}
