/** Shared currency formatting — safe for Server and Client Components. */
export function formatUsd(value: number | null | undefined): string {
  const n = Number(value) || 0
  if (n === 0) return '—'
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toFixed(2)}`
}

export function formatVnd(value: number | null | undefined): string {
  const n = Number(value) || 0
  if (n === 0) return '—'
  return `₫${Math.round(n).toLocaleString('ko-KR')}`
}
