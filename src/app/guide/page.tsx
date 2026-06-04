import Link from 'next/link'
import type { ReactNode } from 'react'
import { requireGuide } from '@/lib/auth/session'
import { getAvailableTours, getMySettlements } from '@/lib/actions/settlementActions'
import { tourLabel } from '@/lib/settlement/mappers'
import type { SettlementStatus } from '@/types'

export const dynamic = 'force-dynamic'

const fontStack =
  'Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", sans-serif'

const pageShell = 'min-h-screen bg-[#FCFAF7] px-4 py-4 text-[#2B2118]'
const contentShell = 'mx-auto max-w-[430px] space-y-4'
const cardBase =
  'block rounded-[22px] border border-[#E9DED2] bg-white px-4 py-4 shadow-[0_4px_18px_rgba(43,33,24,0.035)] transition-colors hover:border-[#F37021]/60'
const emptyCard =
  'flex min-h-[84px] flex-col items-center justify-center rounded-[22px] border border-[#E9DED2] bg-[#FFFDF9] px-4 py-4 text-center shadow-[0_4px_18px_rgba(43,33,24,0.025)]'
const mutedText = 'text-xs leading-5 text-[#8B7B6E]'
const monoMutedText = `${mutedText} font-mono`
const statusPillBase =
  'inline-flex h-6 min-w-fit items-center justify-center rounded-full border px-2.5 text-[11px] font-semibold leading-none'

function statusBadge(status: SettlementStatus): { label: string; className: string } {
  switch (status) {
    case 'draft':
      return { label: '미제출', className: 'border-[#F3D9A9] bg-[#FFF7E8] text-[#B7791F]' }
    case 'submitted':
      return { label: '제출됨', className: 'border-[#F4D8C0] bg-[#FFF1E6] text-[#C05621]' }
    case 'edit_requested':
      return { label: '수정요청', className: 'border-[#F7CFC9] bg-[#FCEAE7] text-[#B42318]' }
    case 'pending_guide_confirmation':
      return { label: '최종확인', className: 'border-[#CFE5D8] bg-[#EAF4EE] text-[#2F7D5A]' }
    case 'paid':
      return { label: '지급완료', className: 'border-[#DED0BF] bg-[#EFE8DE] text-[#6B4E35]' }
    case 'approved':
      return { label: '최종확인', className: 'border-[#CFE5D8] bg-[#EAF4EE] text-[#2F7D5A]' }
    case 'clarification_requested':
      return { label: '확인 이의', className: 'border-[#F7CFC9] bg-[#FCEAE7] text-[#B42318]' }
    case 'rejected':
      return { label: '반려됨', className: 'border-[#F7CFC9] bg-[#FCEAE7] text-[#B42318]' }
  }
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-1.5 w-1.5 rounded-full bg-[#F37021]" aria-hidden="true" />
      <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#2B2118]">{children}</h2>
    </div>
  )
}

function EmptyState({ message, helper }: { message: string; helper: string }) {
  return (
    <div className={emptyCard}>
      <span className="mb-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#FFF1E6] text-xs font-semibold text-[#C97A2B]">
        ·
      </span>
      <p className="text-sm font-semibold text-[#2B2118]">{message}</p>
      <p className="mt-1 text-xs leading-5 text-[#8B7B6E]">{helper}</p>
    </div>
  )
}

export default async function GuidePage() {
  const session = await requireGuide()
  const [availableTours, settlements] = await Promise.all([
    getAvailableTours(),
    getMySettlements(),
  ])

  const draftSettlements = settlements.filter((s) => s.status === 'draft')
  const editRequested = settlements.filter((s) => s.status === 'edit_requested')
  const pendingConfirmation = settlements.filter(
    (s) => s.status === 'pending_guide_confirmation' && s.guide_confirmed_at == null,
  )

  const recent = settlements.slice(0, 3)

  return (
    <div className={pageShell} style={{ fontFamily: fontStack }}>
      <div className={contentShell}>
        <header className="rounded-[22px] border border-[#E9DED2] bg-[#FFFDF9] px-5 py-2 shadow-[0_4px_18px_rgba(43,33,24,0.03)]">
          <p className="text-[13px] font-medium leading-4 text-[#8B7B6E]">안녕하세요,</p>
          <h1 className="text-[25px] font-extrabold leading-none tracking-[-0.03em] text-[#2B2118]">
            {session.full_name}님
          </h1>
          <div className="mt-1.5 h-0.5 w-10 rounded-full bg-[#F37021]" aria-hidden="true" />
        </header>

        <section className="space-y-2">
          <SectionTitle>배정된 투어</SectionTitle>
          {availableTours.length === 0 ? (
            <EmptyState
              message="정산 가능한 투어가 없습니다."
              helper="90일 이내 · 미정산 투어만 표시됩니다."
            />
          ) : (
            availableTours.map((t) => (
              <Link key={t.id} href="/guide/settlements/new" className={cardBase}>
                <p className="text-[15px] font-bold leading-6 tracking-[-0.01em] text-[#2B2118]">{tourLabel(t)}</p>
                <p className={`mt-1 ${mutedText}`}>
                  {t.agency_name} · {t.start_date} ~ {t.end_date} · {t.pax_count}명
                </p>
                <span className="mt-3 inline-flex h-8 items-center justify-center rounded-full bg-[#F37021] px-3.5 text-xs font-bold leading-none text-white transition-colors hover:bg-[#D85F18]">
                  정산서 작성 →
                </span>
              </Link>
            ))
          )}
        </section>

        <section className="space-y-2">
          <SectionTitle>작성중</SectionTitle>
          {draftSettlements.length === 0 ? (
            <EmptyState
              message="작성중인 정산서가 없습니다."
              helper="임시저장한 정산서가 있을 때 표시됩니다."
            />
          ) : (
            draftSettlements.map((s) => (
              <Link key={s.id} href={`/guide/settlements/${s.id}/edit`} className={cardBase}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold leading-6 tracking-[-0.01em] text-[#2B2118]">
                      {s.tour?.pattern}
                    </p>
                    <p className={monoMutedText}>{s.tour?.tour_code}</p>
                  </div>
                  <span className={`${statusPillBase} border-[#F3D9A9] bg-[#FFF7E8] text-[#B7791F]`}>작성중</span>
                </div>
                <p className="mt-3 text-xs font-bold text-[#B7791F]">이어 작성하기 →</p>
              </Link>
            ))
          )}
        </section>

        {editRequested.length > 0 && (
          <section className="space-y-2">
            <SectionTitle>수정 필요</SectionTitle>
            {editRequested.map((s) => (
              <Link key={s.id} href={`/guide/settlements/${s.id}/edit`} className={cardBase}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold leading-6 tracking-[-0.01em] text-[#2B2118]">
                      {s.tour?.pattern}
                    </p>
                    <p className={monoMutedText}>{s.tour?.tour_code}</p>
                  </div>
                  <span className={`${statusPillBase} border-[#F7CFC9] bg-[#FCEAE7] text-[#B42318]`}>수정요청</span>
                </div>
                {s.reject_reason && (
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#B42318]">반려: {s.reject_reason}</p>
                )}
                <p className="mt-3 text-xs font-bold text-[#F37021]">수정하기 →</p>
              </Link>
            ))}
          </section>
        )}

        {pendingConfirmation.length > 0 && (
          <section className="space-y-2">
            <SectionTitle>최종 확인 필요</SectionTitle>
            {pendingConfirmation.map((s) => (
              <Link key={s.id} href={`/guide/settlements/${s.id}/confirm`} className={cardBase}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold leading-6 tracking-[-0.01em] text-[#2B2118]">
                      {s.tour?.pattern}
                    </p>
                    <p className={monoMutedText}>{s.tour?.tour_code}</p>
                  </div>
                  <span className={`${statusPillBase} border-[#CFE5D8] bg-[#EAF4EE] text-[#2F7D5A]`}>확인 필요</span>
                </div>
                <p className="mt-3 text-xs font-bold text-[#2F7D5A]">변경사항 확인 →</p>
              </Link>
            ))}
          </section>
        )}

        {recent.length > 0 && (
          <section className="space-y-2 pb-2">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle>최근 정산서</SectionTitle>
              <Link
                href="/guide/settlements"
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-[#F37021] bg-white px-3.5 text-xs font-bold leading-none text-[#C44F12] transition-colors hover:bg-[#FFF1E6]"
              >
                전체 정산서 보기
              </Link>
            </div>
            {recent.map((s) => {
              const badge = statusBadge(s.status)
              const href =
                s.status === 'pending_guide_confirmation' && s.guide_confirmed_at == null
                  ? `/guide/settlements/${s.id}/confirm`
                  : s.status === 'draft' || s.status === 'rejected' || s.status === 'edit_requested'
                  ? `/guide/settlements/${s.id}/edit`
                  : `/guide/settlements/${s.id}`
              return (
                <Link key={s.id} href={href} className={cardBase}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold leading-6 tracking-[-0.01em] text-[#2B2118]">
                        {s.tour?.pattern}
                      </p>
                      <p className={monoMutedText}>{s.tour?.tour_code}</p>
                    </div>
                    <span className={`${statusPillBase} ${badge.className}`}>{badge.label}</span>
                  </div>
                </Link>
              )
            })}
          </section>
        )}
      </div>
    </div>
  )
}
