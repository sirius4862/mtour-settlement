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
            : '「임시저장」으로 회사 전용 필드를 저장하세요(상태 유지). 가이드 입력 항목이 틀렸다면 「가이드 수정 요청」을 사용하세요. 정산서가 정확할 때만 「가이드 최종확인 요청」을 보내세요.'}
        </p>
      </div>
      <SettlementForm
        tours={[full.tour]}
        guideName={formatGuideDisplayName(guide)}
        mode="edit"
        formRole="admin"
        initialFull={full}
        adminEdit={{ backHref: `/admin/settlements/${id}`, actorRole: session.role }}
      />
    </>
  )
}
