'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  saveVehicleReportDraft,
  submitVehicleReport,
  type VehicleReportRecord,
} from '@/lib/actions/vehicleReportActions'
import type { DailyRouteRow } from '@/lib/vehicle/report-validation'
import {
  buildVehicleReportFormPayload,
  vehicleReportReadOnlyValues,
  VEHICLE_REPORT_BASIC_INFO_FIELDS,
} from '@/lib/vehicle/vehicle-report-form'

interface Props {
  tourId: string
  report: VehicleReportRecord | null
}

const inputClass =
  'w-full min-h-11 px-3 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 ' +
  'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500'

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-800">
        <span className="h-1.5 w-1.5 rounded-full bg-orange-500" aria-hidden="true" />
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

function ReadOnlyValue({ value }: { value: string }) {
  return <p className="text-sm text-gray-800 whitespace-pre-wrap">{value || '-'}</p>
}

function initialRoutes(report: VehicleReportRecord | null): DailyRouteRow[] {
  return report?.daily_routes?.length ? report.daily_routes : [{ date: '', route: '' }]
}

export function VehicleReportForm({ tourId, report }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const locked = report?.status === 'submitted'

  const [eventCode, setEventCode] = useState(report?.event_code ?? '')
  const [eventPeriod, setEventPeriod] = useState(report?.event_period_text ?? '')
  const [pax, setPax] = useState(report?.pax_text ?? '')
  const [flight, setFlight] = useState(report?.flight_info_text ?? '')
  const [vehicle, setVehicle] = useState(report?.vehicle_text ?? '')
  const [hotel, setHotel] = useState(report?.hotel_text ?? '')
  const [guide, setGuide] = useState(report?.guide_text ?? '')
  const [specialNotes, setSpecialNotes] = useState(report?.special_notes ?? '')
  const [routes, setRoutes] = useState<DailyRouteRow[]>(initialRoutes(report))

  useEffect(() => {
    if (locked) return
    setEventCode(report?.event_code ?? '')
    setEventPeriod(report?.event_period_text ?? '')
    setPax(report?.pax_text ?? '')
    setFlight(report?.flight_info_text ?? '')
    setVehicle(report?.vehicle_text ?? '')
    setHotel(report?.hotel_text ?? '')
    setGuide(report?.guide_text ?? '')
    setSpecialNotes(report?.special_notes ?? '')
    setRoutes(initialRoutes(report))
  }, [report, locked])

  const buildPayload = () =>
    buildVehicleReportFormPayload({
      event_code: eventCode,
      event_period_text: eventPeriod,
      pax_text: pax,
      flight_info_text: flight,
      vehicle_text: vehicle,
      hotel_text: hotel,
      guide_text: guide,
      daily_routes: routes,
      special_notes: specialNotes,
    })

  const updateRoute = (index: number, key: keyof DailyRouteRow, value: string) => {
    setRoutes((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
  }
  const addRoute = () => setRoutes((prev) => [...prev, { date: '', route: '' }])
  const removeRoute = (index: number) =>
    setRoutes((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))

  const handleSaveDraft = () => {
    setError('')
    setNotice('')
    startTransition(async () => {
      const result = await saveVehicleReportDraft(tourId, buildPayload())
      if (result.ok) {
        setNotice('임시저장되었습니다.')
        router.refresh()
      } else {
        setError(result.error ?? '저장에 실패했습니다.')
      }
    })
  }

  const handleSubmit = () => {
    setError('')
    setNotice('')
    if (!window.confirm('제출 후에는 수정할 수 없습니다. 제출하시겠습니까?')) return
    startTransition(async () => {
      const result = await submitVehicleReport(tourId, buildPayload())
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.error ?? '제출에 실패했습니다.')
      }
    })
  }

  // ── Read-only (submitted) view — always render saved server report ─────────
  if (locked && report) {
    const saved = vehicleReportReadOnlyValues(report)
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          제출완료된 리포트입니다. 수정할 수 없습니다.
        </div>

        <Card title="기본정보">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {VEHICLE_REPORT_BASIC_INFO_FIELDS.map(({ label, key }) => (
              <Field key={key} label={label}>
                <ReadOnlyValue value={saved[key]} />
              </Field>
            ))}
          </div>
        </Card>

        <Card title="날짜별 동선">
          {saved.daily_routes.length === 0 ? (
            <p className="text-sm text-gray-400">등록된 동선이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {saved.daily_routes.map((row, i) => (
                <li key={i} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                  <p className="text-xs font-medium text-gray-500">{row.date || '날짜 미입력'}</p>
                  <p className="mt-0.5 text-sm text-gray-800 whitespace-pre-wrap">{row.route || '-'}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="특이사항">
          <ReadOnlyValue value={saved.special_notes} />
        </Card>
      </div>
    )
  }

  // ── Editable (draft / new) view ───────────────────────────────────────────
  return (
    <div className="space-y-4">
      <Card title="기본정보">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="행사코드">
            <input className={inputClass} value={eventCode} maxLength={300}
              onChange={(e) => setEventCode(e.target.value)} placeholder="EVENT-0422" />
          </Field>
          <Field label="행사기간">
            <input className={inputClass} value={eventPeriod} maxLength={300}
              onChange={(e) => setEventPeriod(e.target.value)} placeholder="2026-04-22 ~ 2026-04-25" />
          </Field>
          <Field label="인원">
            <input className={inputClass} value={pax} maxLength={300}
              onChange={(e) => setPax(e.target.value)} placeholder="18명" />
          </Field>
          <Field label="항공편">
            <input className={inputClass} value={flight} maxLength={300}
              onChange={(e) => setFlight(e.target.value)} placeholder="VN123 / VN456" />
          </Field>
          <Field label="차량">
            <input className={inputClass} value={vehicle} maxLength={300}
              onChange={(e) => setVehicle(e.target.value)} placeholder="16Seat" />
          </Field>
          <Field label="호텔">
            <input className={inputClass} value={hotel} maxLength={300}
              onChange={(e) => setHotel(e.target.value)} placeholder="호텔명" />
          </Field>
          <Field label="가이드">
            <input className={inputClass} value={guide} maxLength={300}
              onChange={(e) => setGuide(e.target.value)} placeholder="가이드명 / 연락처" />
          </Field>
        </div>
      </Card>

      <Card title="날짜별 동선">
        <div className="space-y-2">
          {routes.map((row, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-xl border border-gray-100 p-2 sm:flex-row sm:items-start">
              <input
                type="date"
                className={`${inputClass} sm:w-40`}
                value={row.date}
                onChange={(e) => updateRoute(i, 'date', e.target.value)}
              />
              <input
                className={`${inputClass} flex-1`}
                value={row.route}
                maxLength={1000}
                onChange={(e) => updateRoute(i, 'route', e.target.value)}
                placeholder="공항 - 호텔"
              />
              <button
                type="button"
                onClick={() => removeRoute(i)}
                disabled={routes.length <= 1}
                className="shrink-0 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-40"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRoute}
          className="mt-2 rounded-xl border border-dashed border-orange-300 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50"
        >
          + 동선 추가
        </button>
      </Card>

      <Card title="특이사항">
        <textarea
          className={`${inputClass} min-h-28`}
          value={specialNotes}
          maxLength={4000}
          onChange={(e) => setSpecialNotes(e.target.value)}
          placeholder="HUE 일정 여부, 추가 미팅/센딩, 기타 운영 메모 등"
        />
      </Card>

      {error && (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}
      {notice && (
        <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={pending}
          className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {pending ? '처리 중…' : '임시저장'}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className="flex-1 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {pending ? '처리 중…' : '최종제출'}
        </button>
      </div>
    </div>
  )
}
