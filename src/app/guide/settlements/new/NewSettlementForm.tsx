'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upsertSettlement, submitSettlement } from '@/lib/actions/settlementActions'
import type { Tour } from '@/types'

interface Props {
  tours: Tour[]
  guideId: string
  branchId: string | null
}

const n = (v: string) => parseFloat(v) || 0

export function NewSettlementForm({ tours }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [savedId, setSavedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  // 폼 상태
  const [tourId, setTourId] = useState('')
  const [exchangeRate, setExchangeRate] = useState('26000')
  const [advanceVnd, setAdvanceVnd] = useState('')
  const [tourFeeUsd, setTourFeeUsd] = useState('')
  const [charmingOtherUsd, setCharmingOtherUsd] = useState('')
  const [tipReceivedUsd, setTipReceivedUsd] = useState('')
  const [optionCreditUsd, setOptionCreditUsd] = useState('')
  const [vehicleFeeUsd, setVehicleFeeUsd] = useState('')
  const [headTaxUsd, setHeadTaxUsd] = useState('')
  const [seoulBizFeeUsd, setSeoulBizFeeUsd] = useState('')
  const [tcGuideUsd, setTcGuideUsd] = useState('')
  const [tcCompanyUsd, setTcCompanyUsd] = useState('')
  const [megugiUsd, setMegugiUsd] = useState('')
  const [guideDailyFeeUsd, setGuideDailyFeeUsd] = useState('')
  const [settlementRatio, setSettlementRatio] = useState('0.5')
  const [guideNote, setGuideNote] = useState('')

  const selectedTour = tours.find(t => t.id === tourId)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const handleSave = () => {
    if (!tourId) { setError('투어를 선택해주세요.'); return }
    setError('')
    start(async () => {
      const result = await upsertSettlement({
        id: savedId ?? undefined,
        tour_id: tourId,
        exchange_rate: n(exchangeRate),
        advance_vnd: n(advanceVnd),
        tour_fee_usd: n(tourFeeUsd),
        charming_other_usd: n(charmingOtherUsd),
        tip_received_usd: n(tipReceivedUsd),
        option_credit_usd: n(optionCreditUsd),
        vehicle_fee_usd: n(vehicleFeeUsd),
        head_tax_usd: n(headTaxUsd),
        seoul_biz_fee_usd: n(seoulBizFeeUsd),
        tc_guide_usd: n(tcGuideUsd),
        tc_company_usd: n(tcCompanyUsd),
        megugi_usd: n(megugiUsd),
        guide_daily_fee_usd: n(guideDailyFeeUsd),
        settlement_ratio: n(settlementRatio),
        guide_note: guideNote.trim() || null,
      })
      if (result.ok && result.id) {
        setSavedId(result.id)
        showToast('임시저장 완료')
      } else {
        setError(result.error ?? '저장 실패')
      }
    })
  }

  const handleSubmit = () => {
    if (!savedId) { handleSave(); return }
    start(async () => {
      await submitSettlement(savedId)
    })
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* 헤더 */}
      <div className="sticky top-14 z-20 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-500">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 15L7.5 10l5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <h1 className="font-semibold text-gray-800">정산서 작성</h1>
          {savedId && <span className="ml-auto text-xs text-emerald-600">✓ 저장됨</span>}
        </div>
      </div>

      <div className="flex-1 px-4 py-4 space-y-6 pb-32">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* 투어 선택 */}
        <Section title="투어 선택" required>
          {tours.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">배정된 투어가 없습니다.</p>
          ) : (
            <select value={tourId} onChange={e => setTourId(e.target.value)}
              className="w-full px-3 py-3 border border-gray-200 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">투어를 선택하세요</option>
              {tours.map(t => (
                <option key={t.id} value={t.id}>
                  [{t.tour_code}] {t.pattern} — {t.start_date}~{t.end_date} ({t.pax_count}명)
                </option>
              ))}
            </select>
          )}
          {selectedTour && (
            <div className="mt-2 px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-700 space-y-0.5">
              <p>여행사: {selectedTour.agency_name} · {selectedTour.nights}박 {selectedTour.nights + 1}일</p>
              {selectedTour.vehicle_type && <p>차량: {selectedTour.vehicle_type}</p>}
            </div>
          )}
        </Section>

        {/* 환율 */}
        <Section title="환율 (VND/USD)">
          <NumberInput label="환율" value={exchangeRate} onChange={setExchangeRate} placeholder="26000" suffix="동/달러" />
        </Section>

        {/* 전도금 */}
        <Section title="전도금 (엑셀 A76)">
          <NumberInput label="전도금 (VND)" value={advanceVnd} onChange={setAdvanceVnd} placeholder="0" suffix="₫" />
          {n(advanceVnd) > 0 && n(exchangeRate) > 0 && (
            <p className="text-xs text-gray-400 mt-1">≈ ${(n(advanceVnd) / n(exchangeRate)).toFixed(2)}</p>
          )}
        </Section>

        {/* 수익 */}
        <Section title="수익 항목">
          <NumberInput label="투어피 (USD)" value={tourFeeUsd} onChange={setTourFeeUsd} placeholder="0" suffix="$" />
          <NumberInput label="차밍쇼/기타 수익 (USD)" value={charmingOtherUsd} onChange={setCharmingOtherUsd} placeholder="0" suffix="$" />
          <NumberInput label="받은 팁 (USD)" value={tipReceivedUsd} onChange={setTipReceivedUsd} placeholder="0" suffix="$" />
          <NumberInput label="옵션외상/팁송금 (USD)" value={optionCreditUsd} onChange={setOptionCreditUsd} placeholder="0" suffix="$" />
        </Section>

        {/* 기타 포함사항 */}
        <Section title="기타 포함사항 (지출)">
          <NumberInput label="차량비 (USD)" value={vehicleFeeUsd} onChange={setVehicleFeeUsd} placeholder="0" suffix="$" />
          <NumberInput label="인두세 (USD)" value={headTaxUsd} onChange={setHeadTaxUsd} placeholder="0" suffix="$" />
          <NumberInput label="서울영업비 (USD)" value={seoulBizFeeUsd} onChange={setSeoulBizFeeUsd} placeholder="0" suffix="$" />
        </Section>

        {/* T/C 정산 */}
        <Section title="T/C 정산 (엑셀 H83, J83)">
          <NumberInput label="T/C 정산 가이드분 (USD)" value={tcGuideUsd} onChange={setTcGuideUsd} placeholder="0" suffix="$" />
          <NumberInput label="T/C 정산 회사분 (USD)" value={tcCompanyUsd} onChange={setTcCompanyUsd} placeholder="0" suffix="$" />
        </Section>

        {/* 정산 조정 */}
        <Section title="정산 조정 (엑셀 R80, R82)">
          <NumberInput label="메꾸기 (USD)" value={megugiUsd} onChange={setMegugiUsd} placeholder="0" suffix="$" />
          <NumberInput label="가이드 일비 (USD)" value={guideDailyFeeUsd} onChange={setGuideDailyFeeUsd} placeholder="0" suffix="$" />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              정산비율 <span className="text-blue-600 font-semibold">{Math.round(n(settlementRatio) * 100)}%</span>
            </label>
            <input type="range" min="0" max="100" step="5"
              value={Math.round(n(settlementRatio) * 100)}
              onChange={e => setSettlementRatio(String(parseInt(e.target.value) / 100))}
              className="w-full accent-blue-600" />
          </div>
        </Section>

        {/* 메모 */}
        <Section title="가이드 메모 (선택)">
          <textarea value={guideNote} onChange={e => setGuideNote(e.target.value)}
            placeholder="관리자에게 전달할 메모"
            rows={3}
            className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </Section>

        <p className="text-xs text-gray-400 text-center pb-2">
          호텔·식사·입장료·기타지출·쇼핑·옵션은 임시저장 후 상세 편집에서 추가할 수 있습니다.
        </p>
      </div>

      {/* 하단 버튼 */}
      <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 space-y-2 max-w-lg mx-auto">
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={pending}
            className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {pending ? '저장 중…' : '임시저장'}
          </button>
          <button onClick={handleSubmit} disabled={pending || !tourId}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">
            {pending ? '처리 중…' : '제출하기'}
          </button>
        </div>
      </div>

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 px-4 py-2.5 bg-gray-800 text-white text-sm rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

// ── 재사용 컴포넌트 ──────────────────────────────────────────

function Section({ title, children, required }: {
  title: string; children: React.ReactNode; required?: boolean
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-700 mb-2">
        {title}{required && <span className="text-red-500 ml-1">*</span>}
      </h2>
      <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3">
        {children}
      </div>
    </div>
  )
}

function NumberInput({ label, value, onChange, placeholder, suffix }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; suffix?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-600 w-36 shrink-0">{label}</label>
      <div className="flex-1 relative">
        <input
          type="text" inputMode="decimal" value={value}
          onChange={e => onChange(e.target.value.replace(/[^\d.]/g, ''))}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-right text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}
