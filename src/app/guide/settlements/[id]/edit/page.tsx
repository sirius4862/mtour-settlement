import { notFound, redirect } from 'next/navigation'
import { requireGuide } from '@/lib/auth/session'
import { getAvailableTours, getSettlementFullForGuide } from '@/lib/actions/settlementActions'
import { GuideCorrectionStableShell } from '@/components/settlement/GuideCorrectionStableShell'
import { GuideEditForm } from '@/components/settlement/GuideEditForm'

export const dynamic = 'force-dynamic'

const EDITABLE = new Set(['draft', 'rejected', 'edit_requested'])

export default async function EditSettlementPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireGuide()
  const { id } = await params
  const full = await getSettlementFullForGuide(id)

  if (!full || full.guide_id !== session.id) notFound()
  if (!EDITABLE.has(full.status)) redirect(`/guide/settlements/${id}`)

  const available = await getAvailableTours()
  const tours = available.some((t) => t.id === full.tour_id)
    ? available
    : [full.tour, ...available]

  return (
    <>
      <GuideCorrectionStableShell
        settlementId={full.id}
        status={full.status}
        adminNote={full.admin_note}
      />
      <GuideEditForm
        tours={tours}
        guideName={session.full_name}
        mode="edit"
        initialFull={full}
      />
    </>
  )
}
