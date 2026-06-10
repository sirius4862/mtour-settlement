const fontStack =
  'Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", sans-serif'

function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-full bg-[#F1E7DD] ${className}`} />
}

export default function GuideVehicleReportsLoading() {
  return (
    <div
      className="min-h-screen bg-[#FCFAF7] px-4 py-4 text-[#2B2118]"
      style={{ fontFamily: fontStack }}
      aria-label="차량 리포트 확인 불러오는 중"
    >
      <div className="mx-auto max-w-[430px] space-y-4">
        <header className="rounded-[22px] border border-[#E9DED2] bg-[#FFFDF9] px-5 py-4 shadow-[0_4px_18px_rgba(43,33,24,0.03)]">
          <Bar className="h-6 w-40" />
          <Bar className="mt-2 h-3 w-full max-w-xs" />
        </header>

        <div className="rounded-[22px] border border-[#E9DED2] bg-[#FFFDF9] px-4 py-3 shadow-[0_4px_18px_rgba(43,33,24,0.025)]">
          <Bar className="h-3 w-full" />
          <Bar className="mt-3 h-10 w-full rounded-xl" />
        </div>

        <ul className="space-y-2">
          {[0, 1, 2].map((row) => (
            <li
              key={row}
              className="rounded-[22px] border border-[#E9DED2] bg-white px-4 py-4 shadow-[0_4px_18px_rgba(43,33,24,0.035)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Bar className="h-4 w-3/5" />
                  <Bar className="mt-2 h-3 w-24" />
                  <Bar className="mt-1 h-3 w-32" />
                </div>
                <Bar className="h-6 w-14 shrink-0 rounded-full" />
              </div>
              <Bar className="mt-3 h-3 w-28" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
