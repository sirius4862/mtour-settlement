const fontStack =
  'Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", sans-serif'

function SectionSkeleton({ title, rows = 1 }: { title: string; rows?: number }) {
  return (
    <section className="space-y-2" aria-label={`${title} 불러오는 중`}>
      <div className="flex items-center gap-2.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[#F37021]" aria-hidden="true" />
        <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#2B2118]">{title}</h2>
      </div>
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-[22px] border border-[#E9DED2] bg-white px-4 py-4 shadow-[0_4px_18px_rgba(43,33,24,0.035)]"
        >
          <div className="h-4 w-3/5 animate-pulse rounded-full bg-[#F1E7DD]" />
          <div className="mt-3 h-3 w-4/5 animate-pulse rounded-full bg-[#F7EFE8]" />
          <div className="mt-4 h-8 w-24 animate-pulse rounded-full bg-[#FBE1CC]" />
        </div>
      ))}
    </section>
  )
}

export default function GuideLoading() {
  return (
    <div className="min-h-screen bg-[#FCFAF7] px-4 py-4 text-[#2B2118]" style={{ fontFamily: fontStack }}>
      <div className="mx-auto max-w-[430px] space-y-4">
        <header className="rounded-[22px] border border-[#E9DED2] bg-[#FFFDF9] px-5 py-4 shadow-[0_4px_18px_rgba(43,33,24,0.03)]">
          <p className="text-base font-medium leading-snug text-[#8B7B6E]">안녕하세요</p>
          <div className="mt-3 flex justify-end">
            <div className="h-7 w-32 animate-pulse rounded-full bg-[#F7EFE8]" />
          </div>
        </header>

        <SectionSkeleton title="배정된 투어" rows={2} />
        <SectionSkeleton title="작성중" />
        <SectionSkeleton title="수정 필요" />
        <SectionSkeleton title="최종 확인 필요" />
        <SectionSkeleton title="최근 정산서" rows={2} />
      </div>
    </div>
  )
}
