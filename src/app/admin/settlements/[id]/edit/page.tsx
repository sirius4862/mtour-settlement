import { notFound, redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/session'
import { canAdminAccessRegion } from '@/lib/region/permissions'
import { createClient } from '@/lib/supabase/server'
import { getSettlementFull } from '@/lib/actions/settlementActions'
import { SettlementForm } from '@/components/settlement/SettlementForm'
import { formatGuideDisplayName } from '@/lib/guide/display-name'
import { canAdminOrMasterAdminEditSettlement, canMasterAdminEditSettlement } from '@/types'

export const dynamic = 'force-dynamic'

export default async function AdminSettlementEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireAdmin()
  const { id } = await params
  const full = await getSettlementFull(id)
  if (!full) notFound()

  if (
    !canAdminAccessRegion(
      { role: session.role, assignedRegionId: session.branch_id },
      full.branch_id,
    )
  ) {
    notFound()
  }

  if (!canAdminOrMasterAdminEditSettlement(full.status, session.role)) {
    redirect(`/admin/settlements/${id}`)
  }

  const supabase = await createClient()
  const { data: guide } = await supabase
    .from('profiles')
    .select('full_name, email, korean_name, vietnamese_name')
    .eq('id', full.guide_id)
    .maybeSingle()

  return (
    <>
      <div className="mb-4 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-sm text-blue-800">
        <p className="font-semibold">
          {canMasterAdminEditSettlement(full.status) ? '마스터 관리자 수정' : '관리자 검토 수정'}
        </p>
        <p className="text-xs text-blue-600 mt-1">
          {canMasterAdminEditSettlement(full.status)
            ? '저장하면 가이드 최종 확인 대기(pending_guide_confirmation)로 되돌아갑니다. 가이드 재확인 후에만 지급할 수 있습니다.'
            : '「임시저장」으로 회사 전용 필드를 저장하세요(상태 유지). 저장 후 「가이드 검토 요청」으로 가이드 최종 확인을 보낼 수 있습니다. 승인·지급은 가이드 확인 후 상세 화면에서 처리합니다.'}
        </p>
      </div>
      <SettlementForm
        tours={[full.tour]}
        guideName={formatGuideDisplayName(guide)}
        mode="edit"
        initialFull={full}
        adminEdit={{ backHref: `/admin/settlements/${id}` }}
      />
    </>
  )
}
