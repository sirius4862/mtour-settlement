import { requireGuide } from '@/lib/auth/session'
import { getAvailableTours } from '@/lib/actions/settlementActions'
import { NewSettlementForm } from './NewSettlementForm'

export const dynamic = 'force-dynamic'

export default async function NewSettlementPage() {
  const session = await requireGuide()
  const tours = await getAvailableTours()

  return <NewSettlementForm tours={tours} guideId={session.id} branchId={session.branch_id} />
}
