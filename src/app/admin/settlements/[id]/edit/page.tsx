import { notFound, redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { getSettlementFull } from '@/lib/actions/settlementActions'
import { SettlementForm } from '@/components/settlement/SettlementForm'
import { formatGuideDisplayName } from '@/lib/guide/display-name'
import { canAdminEditSettlement } from '@/types'

export const dynamic = 'force-dynamic'

export default async function AdminSettlementEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const full = await getSettlementFull(id)
  if (!full) notFound()

  if (!canAdminEditSettlement(full.status)) {
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
        <p className="font-semibold">관리자 검토 수정</p>
        <p className="text-xs text-blue-600 mt-1">
          회사 전용·회사 확인 항목만 저장됩니다. 저장해도 상태는 유지되며, 저장 후 상세 화면에서
          「가이드 확인 요청」을 보내세요.
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
