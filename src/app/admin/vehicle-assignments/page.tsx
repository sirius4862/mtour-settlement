import { requireAdmin } from '@/lib/auth/session'
import {
  getAdminVehicleAssignmentTours,
  getAdminVehicleCompanies,
} from '@/lib/actions/vehicleCompanyAdminActions'
import { VehicleAssignmentTable } from './VehicleAssignmentTable'

export const dynamic = 'force-dynamic'

export default async function AdminVehicleAssignmentsPage() {
  await requireAdmin()
  const [tours, companies] = await Promise.all([
    getAdminVehicleAssignmentTours(),
    getAdminVehicleCompanies(),
  ])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">차량회사 배정</h1>
        <p className="mt-1 text-sm text-gray-500">
          투어에 차량회사를 배정합니다. 차량 리포트가 작성되면 배정회수를 통해서만 초기화할 수 있습니다.
        </p>
      </div>
      <VehicleAssignmentTable tours={tours} companies={companies} />
    </div>
  )
}
