import type { SettlementStatus, UserRole } from '@/types'
import { WORKFLOW_STATUS_ORDER, isWorkflowStatus } from '@/lib/settlement/status-display'
import { normalizeStatusForDashboard } from './settlement-list'

export type AdminDashboardStatusFilter = (typeof WORKFLOW_STATUS_ORDER)[number]

export function parseDashboardStatusFilter(value?: string | null): AdminDashboardStatusFilter | '' {
  return value && isWorkflowStatus(value as SettlementStatus)
    ? (value as AdminDashboardStatusFilter)
    : ''
}

export function resolveDashboardRegionFilter(params: {
  role: UserRole
  assignedRegionId: string | null
  requestedRegionId?: string | null
}): string {
  if (params.role === 'master_admin') return params.requestedRegionId?.trim() ?? ''
  return params.assignedRegionId ?? ''
}

export function buildAdminDashboardUrl(params?: {
  status?: string
  regionId?: string
  page?: number
}): string {
  const q = new URLSearchParams()
  if (params?.status) q.set('status', params.status)
  if (params?.regionId) q.set('regionId', params.regionId)
  if (params?.page && params.page > 1) q.set('page', String(params.page))
  const s = q.toString()
  return s ? `/admin?${s}` : '/admin'
}

export function countDashboardFilteredRows(
  rows: { status: string; branch_id?: string | null }[],
  filters?: { status?: string; regionId?: string },
): number {
  const status = parseDashboardStatusFilter(filters?.status)
  return rows.filter((row) => {
    if (filters?.regionId && row.branch_id !== filters.regionId) return false
    if (!status) return true
    return normalizeStatusForDashboard(row.status) === status
  }).length
}
