import { requireGuide } from '@/lib/auth/session'
import { getAvailableTours } from '@/lib/actions/settlementActions'
import { SettlementForm } from '@/components/settlement/SettlementForm'

export const dynamic = 'force-dynamic'

export default async function NewSettlementPage() {
  const session = await requireGuide()
  const tours = await getAvailableTours()

  return (
    <SettlementForm
      tours={tours}
      guideName={session.full_name}
      mode="new"
    />
  )
}
