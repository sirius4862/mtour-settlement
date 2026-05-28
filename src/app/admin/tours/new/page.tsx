import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/session'
import { getBranches, getGuideProfiles } from '@/lib/actions/tourActions'
import { CreateTourForm } from './CreateTourForm'

export const dynamic = 'force-dynamic'

export default async function AdminNewTourPage() {
  await requireAdmin()
  const [branches, guides] = await Promise.all([getBranches(), getGuideProfiles()])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/admin/tours" className="text-gray-400 hover:text-gray-700">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.5 15L7.5 10l5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </Link>
        <h1 className="text-lg font-bold text-gray-900">투어 등록</h1>
      </div>

      <p className="text-sm text-gray-500">
        투어를 생성하면 배정된 가이드의{' '}
        <span className="font-medium text-gray-700">새 정산서</span> 화면에 표시됩니다.
        시작일은 최근 90일 이내여야 합니다.
      </p>

      <CreateTourForm branches={branches} guides={guides} />
    </div>
  )
}
