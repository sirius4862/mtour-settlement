import { requireGuide } from '@/lib/auth/session'
import { getAvailableTours } from '@/lib/actions/settlementActions'
import { SettlementForm } from '@/components/settlement/SettlementForm'
import { resolveRequestedTourId } from '@/lib/settlement/new-settlement-binding'

export const dynamic = 'force-dynamic'

export default async function NewSettlementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireGuide()
  const tours = await getAvailableTours()
  const { tourId } = await searchParams

  const initialTourId = resolveRequestedTourId(tours, tourId) ?? undefined

  return (
    <SettlementForm
      key={initialTourId ?? 'new'}
      tours={tours}
      guideName={session.full_name}
      mode="new"
      initialTourId={initialTourId}
    />
  )
}
