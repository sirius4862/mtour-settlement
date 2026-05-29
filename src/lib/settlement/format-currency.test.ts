import { describe, expect, it } from 'vitest'
import { formatUsd, formatVnd } from './format-currency'

describe('format-currency', () => {
  it('formatUsd handles null and string numeric values', () => {
    expect(formatUsd(null)).toBe('—')
    expect(formatUsd(undefined)).toBe('—')
    expect(formatUsd('12.5' as unknown as number)).toBe('$12.50')
  })

  it('formatVnd handles null and string numeric values', () => {
    expect(formatVnd(null)).toBe('—')
    expect(formatVnd('26000' as unknown as number)).toBe('₫26,000')
  })
})
