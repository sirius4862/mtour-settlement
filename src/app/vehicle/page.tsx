export const dynamic = 'force-dynamic'

export default function VehicleHomePage() {
  return (
    <div className="rounded-2xl border border-orange-100 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
        <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
          <path d="M2 10V6.5L3.5 4h7L12 6.5V10M2 10h10M4 10v.5M10 10v.5"
            stroke="#ea580c" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <h1 className="text-lg font-semibold text-gray-800">차량회사 리포트</h1>
      <p className="mt-2 text-sm text-gray-500">차량회사 리포트 기능을 준비 중입니다.</p>
    </div>
  )
}
