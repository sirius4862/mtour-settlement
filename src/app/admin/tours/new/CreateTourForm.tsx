'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Branch } from '@/types'
import type { GuideOption } from '@/lib/actions/tourActions'
import { createTour } from '@/lib/actions/tourActions'
import { calcTourNights } from '@/lib/tour/nights'
import { TOUR_REGISTRATION_TEXT_MAX_LENGTH } from '@/lib/tour/create-tour-validation'
import { FieldLabel, SectionCard } from '@/components/ui/FormPrimitives'
import { formatGuideAssignmentLabel } from '@/lib/guide/display-name'
import { formatRegionLabel } from '@/lib/region/regions'

interface Props {
  branches: Branch[]
  guides: GuideOption[]
}

export function CreateTourForm({ branches, guides }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const [tourCode, setTourCode] = useState('')
  const [agencyName, setAgencyName] = useState('')
  const [pattern, setPattern] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [paxCount, setPaxCount] = useState('18')
  const [vehicleType, setVehicleType] = useState('29인승')
  const [tcName, setTcName] = useState('')
  const [guideId, setGuideId] = useState('')
  const [branchId, setBranchId] = useState('')

  const branchById = useMemo(
    () => new Map(branches.map((b) => [b.id, b])),
    [branches],
  )

  const nightsPreview = useMemo(() => {
    if (!startDate || !endDate || endDate < startDate) return null
    return calcTourNights(startDate, endDate)
  }, [startDate, endDate])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    startTransition(async () => {
      const result = await createTour({
        tour_code: tourCode,
        agency_name: agencyName,
        pattern,
        start_date: startDate,
        end_date: endDate,
        pax_count: parseInt(paxCount, 10) || 0,
        vehicle_type: vehicleType,
        tc_name: tcName,
        guide_id: guideId,
        branch_id: branchId,
      })

      if (result.ok) {
        router.push('/admin/tours')
        router.refresh()
      } else {
        setError(result.error ?? '투어 생성에 실패했습니다.')
      }
    })
  }

  const inputClass =
    'w-full min-h-12 px-3 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
      <SectionCard>
        <h2 className="text-sm font-semibold text-gray-800 mb-4">투어 정보</h2>
        <div className="space-y-4">
          <div>
            <FieldLabel required>투어코드</FieldLabel>
            <input
              className={inputClass}
              value={tourCode}
              onChange={(e) => setTourCode(e.target.value)}
              maxLength={TOUR_REGISTRATION_TEXT_MAX_LENGTH}
              placeholder="DN-2026-0501"
              required
            />
          </div>
          <div>
            <FieldLabel required>여행사</FieldLabel>
            <input
              className={inputClass}
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              maxLength={TOUR_REGISTRATION_TEXT_MAX_LENGTH}
              placeholder="M투어"
              required
            />
          </div>
          <div>
            <FieldLabel required>패턴</FieldLabel>
            <input
              className={inputClass}
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              maxLength={TOUR_REGISTRATION_TEXT_MAX_LENGTH}
              placeholder="다낭(3N), 호이안"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>시작일</FieldLabel>
              <input
                type="date"
                className={inputClass}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <FieldLabel required>종료일</FieldLabel>
              <input
                type="date"
                className={inputClass}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>
          {nightsPreview !== null && (
            <p className="text-xs text-gray-500">
              예상 박수: <span className="font-medium text-gray-700">{nightsPreview}박</span>
              <span className="text-gray-400 ml-1">(DB에서 자동 계산 · 저장 시 반영)</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>인원</FieldLabel>
              <input
                type="number"
                min={1}
                className={inputClass}
                value={paxCount}
                onChange={(e) => setPaxCount(e.target.value)}
                required
              />
            </div>
            <div>
              <FieldLabel required>차량</FieldLabel>
              <input
                className={inputClass}
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                placeholder="29인승"
                required
              />
            </div>
          </div>
          <div>
            <FieldLabel required>TC 이름</FieldLabel>
            <input
              className={inputClass}
              value={tcName}
              onChange={(e) => setTcName(e.target.value)}
              placeholder="박TC"
              required
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <h2 className="text-sm font-semibold text-gray-800 mb-4">배정</h2>
        <div className="space-y-4">
          <div>
            <FieldLabel required>가이드</FieldLabel>
            <select
              className={inputClass}
              value={guideId}
              onChange={(e) => setGuideId(e.target.value)}
              required
            >
              <option value="">가이드 선택</option>
              {guides.map((g) => (
                <option key={g.id} value={g.id}>
                  {formatGuideAssignmentLabel(g, g.branch_id ? branchById.get(g.branch_id) : null)}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              괄호 없이 표시된 지역은 가이드 소속(홈) 지역입니다. 투어 운영 지역은 아래에서 선택합니다.
            </p>
            {guides.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">등록된 가이드가 없습니다.</p>
            )}
          </div>
          <div>
            <FieldLabel required>지역</FieldLabel>
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
        </div>
      </SectionCard>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-2">
        <Link
          href="/admin/tours"
          className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 text-center hover:bg-gray-50"
        >
          취소
        </Link>
        <button
          type="submit"
          disabled={pending || guides.length === 0 || branches.length === 0}
          className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? '저장 중…' : '투어 생성'}
        </button>
      </div>
    </form>
  )
}
