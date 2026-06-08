'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createVehicleCompany,
  linkVehicleCompanyUser,
  updateVehicleCompany,
  type VehicleCompanyAdminItem,
  type VehicleCompanyProfileOption,
} from '@/lib/actions/vehicleCompanyAdminActions'
import { formatRegionLabel } from '@/lib/region/regions'
import type { Branch } from '@/types'

interface Props {
  companies: VehicleCompanyAdminItem[]
  branches: Branch[]
  profiles: VehicleCompanyProfileOption[]
}

const inputClass =
  'w-full min-h-11 px-3 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 ' +
  'focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500'

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-gray-800">{title}</h2>
      {children}
    </section>
  )
}

export function VehicleCompaniesManager({ companies, branches, profiles }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [branchId, setBranchId] = useState('')

  const [linkProfileId, setLinkProfileId] = useState('')
  const [linkCompanyId, setLinkCompanyId] = useState('')

  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches])
  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies])

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, fallback: string) => {
    setError('')
    startTransition(async () => {
      const result = await fn()
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.error ?? fallback)
      }
    })
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    run(() => createVehicleCompany({ name, branch_id: branchId }), '차량회사 생성에 실패했습니다.')
    setName('')
  }

  const handleLink = (e: React.FormEvent) => {
    e.preventDefault()
    run(() => linkVehicleCompanyUser(linkProfileId, linkCompanyId), '계정 연결에 실패했습니다.')
  }

  return (
    <div className="max-w-2xl space-y-4">
      {error && (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      <Card title="차량회사 등록">
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              className={inputClass}
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              placeholder="차량회사명"
              required
            />
            <select
              className={inputClass}
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              required
            >
              <option value="">지역 선택</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {formatRegionLabel(b.code, b.name)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={pending || branches.length === 0}
            className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {pending ? '처리 중…' : '등록'}
          </button>
        </form>
      </Card>

      <Card title="차량회사 목록">
        {companies.length === 0 ? (
          <p className="text-sm text-gray-400">등록된 차량회사가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {companies.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-500">
                    {branchById.get(c.branch_id)
                      ? formatRegionLabel(branchById.get(c.branch_id)!.code, branchById.get(c.branch_id)!.name)
                      : c.branch_id}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      c.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {c.is_active ? '활성' : '비활성'}
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => updateVehicleCompany(c.id, { is_active: !c.is_active }),
                        '수정에 실패했습니다.',
                      )
                    }
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {c.is_active ? '비활성화' : '활성화'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="차량회사 계정 연결">
        {profiles.length === 0 ? (
          <p className="text-sm text-gray-400">차량회사 권한 계정이 없습니다.</p>
        ) : (
          <form onSubmit={handleLink} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <select
                className={inputClass}
                value={linkProfileId}
                onChange={(e) => setLinkProfileId(e.target.value)}
                required
              >
                <option value="">계정 선택</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {(p.korean_name || p.full_name) ?? p.email}
                    {p.current_vehicle_company_id
                      ? ` · 현재: ${companyById.get(p.current_vehicle_company_id)?.name ?? '연결됨'}`
                      : ''}
                  </option>
                ))}
              </select>
              <select
                className={inputClass}
                value={linkCompanyId}
                onChange={(e) => setLinkCompanyId(e.target.value)}
                required
              >
                <option value="">차량회사 선택</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-500">한 계정은 하나의 차량회사에만 연결됩니다.</p>
            <button
              type="submit"
              disabled={pending || companies.length === 0}
              className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {pending ? '처리 중…' : '연결'}
            </button>
          </form>
        )}
      </Card>
    </div>
  )
}
