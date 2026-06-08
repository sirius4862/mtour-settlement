function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded-full bg-gray-100 ${className}`} />
}

export default function AdminSettlementsLoading() {
  return (
    <div className="space-y-4" aria-label="정산서 목록 불러오는 중">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Bar className="h-6 w-32" />
          <Bar className="mt-2 h-3 w-44" />
        </div>
        <Bar className="h-4 w-24" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Bar className="h-10 w-40 rounded-lg" />
        <Bar className="h-10 w-40 rounded-lg" />
        <Bar className="h-10 w-32 rounded-lg" />
        <Bar className="h-10 flex-1 rounded-lg" />
        <Bar className="h-10 w-20 rounded-lg bg-blue-100" />
      </div>

      <div>
        <Bar className="h-5 w-24" />
        <Bar className="mt-2 h-3 w-64" />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="grid grid-cols-6 gap-3 border-b border-gray-50 px-3 py-3 last:border-b-0">
            <Bar className="h-4" />
            <Bar className="col-span-2 h-4" />
            <Bar className="h-4" />
            <Bar className="h-4" />
            <Bar className="h-4" />
          </div>
        ))}
      </div>
    </div>
  )
}
