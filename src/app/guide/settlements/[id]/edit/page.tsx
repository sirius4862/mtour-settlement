import { notFound, redirect } from 'next/navigation'
import { requireGuide } from '@/lib/auth/session'
import { getSettlementFullForGuide } from '@/lib/actions/settlementActions'
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

  // Existing edit: tour is read-only in the form; full.tour from getSettlementFull is sufficient.
  const tours = [full.tour]

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
