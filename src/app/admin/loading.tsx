const statusCards = ['미제출', '제출됨', '수정요청', '최종확인']

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded-full bg-gray-100 ${className}`} />
}

export default function AdminLoading() {
  return (
    <div className="space-y-6" aria-label="관리자 대시보드 불러오는 중">
      <div>
        <Bar className="h-6 w-40" />
        <Bar className="mt-2 h-4 w-56" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Bar className="h-5 w-28" />
            <Bar className="mt-2 h-3 w-52" />
          </div>
          <Bar className="h-8 w-28" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statusCards.map((label) => (
            <div key={label} className="rounded-2xl border border-gray-100 bg-white p-4 text-center">
              <Bar className="mx-auto h-7 w-10" />
              <div className="mt-2 inline-flex h-6 min-w-16 items-center justify-center rounded-full bg-amber-50 px-2 text-xs font-medium text-amber-700">
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Bar className="h-5 w-24" />
            <Bar className="mt-2 h-3 w-44" />
          </div>
          <Bar className="h-4 w-20" />
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="grid grid-cols-5 gap-3 border-b border-gray-50 px-3 py-3 last:border-b-0">
              <Bar className="h-4" />
              <Bar className="col-span-2 h-4" />
              <Bar className="h-4" />
              <Bar className="h-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
