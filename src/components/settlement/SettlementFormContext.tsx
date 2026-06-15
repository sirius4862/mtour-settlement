'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { SettlementFormRole } from '@/lib/settlement/field-ownership'
import type { SummaryAudience } from '@/lib/settlement/display-labels'
import type {
  CorrectionFieldId,
  CorrectionSectionId,
  CorrectionTarget,
} from '@/lib/settlement/correction-request-meta'

const RoleContext = createContext<SettlementFormRole>('guide')
const AdminReviewContext = createContext(false)

export type GuideRowCorrectionHighlight = {
  message: string
  field: CorrectionFieldId | null
  proposed: string | null
  staleLabel?: string | null
}

type CorrectionRequestContextValue = {
  canRequest: boolean
  requestSection: (sectionId: CorrectionSectionId) => void
  requestRow: (draft: Omit<CorrectionTarget, 'reason' | 'proposed'>) => void
}

type GuideCorrectionHighlightContextValue = {
  activeJumpClientId: string | null
  getRowHighlight: (clientId: string) => GuideRowCorrectionHighlight | undefined
  isFieldHighlighted: (clientId: string, field: CorrectionFieldId) => boolean
}

const CorrectionRequestContext = createContext<CorrectionRequestContextValue | null>(null)
const GuideCorrectionHighlightContext = createContext<GuideCorrectionHighlightContextValue | null>(
  null,
)

export function SettlementFormProvider({
  role,
  adminReviewEdit = false,
  correctionRequest = null,
  guideCorrectionHighlight = null,
  children,
}: {
  role: SettlementFormRole
  adminReviewEdit?: boolean
  correctionRequest?: CorrectionRequestContextValue | null
  guideCorrectionHighlight?: GuideCorrectionHighlightContextValue | null
  children: ReactNode
}) {
  return (
    <RoleContext.Provider value={role}>
      <AdminReviewContext.Provider value={adminReviewEdit}>
        <CorrectionRequestContext.Provider value={correctionRequest}>
          <GuideCorrectionHighlightContext.Provider value={guideCorrectionHighlight}>
            {children}
          </GuideCorrectionHighlightContext.Provider>
        </CorrectionRequestContext.Provider>
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

export function useCorrectionRequest(): CorrectionRequestContextValue | null {
  return useContext(CorrectionRequestContext)
}

export function useGuideCorrectionHighlight(): GuideCorrectionHighlightContextValue | null {
  return useContext(GuideCorrectionHighlightContext)
}

export function summaryAudienceFromRole(role: SettlementFormRole): SummaryAudience {
  return role === 'admin' ? 'admin' : 'guide'
}
