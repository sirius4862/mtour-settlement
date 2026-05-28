import { requireGuide } from '@/lib/auth/session'
import { SettlementForm } from '@/components/settlement/SettlementForm'

export const dynamic = 'force-dynamic'

/** Phase 2 preview — mock data + calcSettlement() UI shell */
export default async function SettlementPreviewPage() {
  await requireGuide()
  return (
    <SettlementForm
      tours={[]}
      guideName="데모"
      mode="preview"
    />
  )
}
