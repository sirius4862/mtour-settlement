import { requireAdmin } from '@/lib/auth/session'
import {
  getAdminVehicleBranches,
  getAdminVehicleCompanies,
  getAvailableVehicleCompanyProfiles,
} from '@/lib/actions/vehicleCompanyAdminActions'
import { VehicleCompaniesManager } from './VehicleCompaniesManager'

export const dynamic = 'force-dynamic'

export default async function AdminVehicleCompaniesPage() {
  await requireAdmin()
  const [companies, branches, profiles] = await Promise.all([
    getAdminVehicleCompanies(),
    getAdminVehicleBranches(),
    getAvailableVehicleCompanyProfiles(),
  ])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">차량회사 관리</h1>
        <p className="mt-1 text-sm text-gray-500">
          차량회사를 등록하고, 차량회사 권한 계정을 연결합니다.
        </p>
      </div>
      <VehicleCompaniesManager companies={companies} branches={branches} profiles={profiles} />
    </div>
  )
}
