/** Nights between tour start and end dates (date-only strings). */
export function calcTourNights(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  const diffDays = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  return Math.max(diffDays, 0)
}
