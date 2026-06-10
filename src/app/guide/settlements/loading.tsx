function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-full bg-gray-100 ${className}`} />
}

export default function GuideSettlementsLoading() {
  return (
    <div className="space-y-4 px-4 py-5" aria-label="전체 정산서 불러오는 중">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Bar className="h-3 w-16" />
          <Bar className="mt-2 h-5 w-28" />
        </div>
        <div className="h-8 w-20 shrink-0 animate-pulse rounded-lg bg-blue-100" />
      </div>

      <div className="space-y-2 rounded-2xl border border-gray-100 bg-white p-3">
        <Bar className="h-3 w-full max-w-xs" />
        <div className="grid grid-cols-2 gap-2">
          <Bar className="h-10 w-full rounded-lg" />
          <Bar className="h-10 w-full rounded-lg" />
        </div>
        <Bar className="h-10 w-full rounded-lg" />
        <div className="flex justify-end">
          <Bar className="h-9 w-20 rounded-lg" />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Bar className="h-4 w-16" />
        <Bar className="h-3 w-24" />
      </div>

      <div className="space-y-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="mb-2 flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <Bar className="h-4 w-3/5" />
                <Bar className="mt-2 h-3 w-24" />
              </div>
              <Bar className="h-6 w-16 shrink-0 rounded-full" />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Bar className="h-3" />
              <Bar className="h-3" />
              <Bar className="h-3" />
              <Bar className="h-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
