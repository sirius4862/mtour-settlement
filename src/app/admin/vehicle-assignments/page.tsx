import { requireAdmin } from '@/lib/auth/session'
import {
  getAdminVehicleAssignmentTours,
  getAssignableVehicleCompanyProfiles,
} from '@/lib/actions/vehicleCompanyAdminActions'
import { VehicleAssignmentTable } from './VehicleAssignmentTable'

export const dynamic = 'force-dynamic'

export default async function AdminVehicleAssignmentsPage() {
  await requireAdmin()
  const [tours, profiles] = await Promise.all([
    getAdminVehicleAssignmentTours(),
    getAssignableVehicleCompanyProfiles(),
  ])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">차량회사 배정</h1>
        <p className="mt-1 text-sm text-gray-500">
          투어에 차량회사 계정을 배정합니다. 차량회사 계정은 Supabase에서 수동 생성합니다
          (role=vehicle_company, branch_id, 이름). 차량 리포트가 작성되면 배정회수를 통해서만 초기화할 수 있습니다.
        </p>
      </div>
      <VehicleAssignmentTable tours={tours} profiles={profiles} />
    </div>
  )
}
