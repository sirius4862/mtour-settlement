import { describe, expect, it } from 'vitest'
import { formatGuideDisplayName } from './display-name'

describe('formatGuideDisplayName', () => {
  it('prefers korean_name', () => {
    expect(
      formatGuideDisplayName({
        korean_name: '김가이드',
        vietnamese_name: 'Huong',
        full_name: 'Kim',
        email: 'a@b.com',
      }),
    ).toBe('김가이드')
  })

  it('falls back to vietnamese_name', () => {
    expect(
      formatGuideDisplayName({
        korean_name: '  ',
        vietnamese_name: 'Huong',
        full_name: 'Kim',
        email: 'a@b.com',
      }),
    ).toBe('Huong')
  })

  it('falls back to full_name then email', () => {
    expect(formatGuideDisplayName({ full_name: 'Kim Guide', email: 'g@t.com' })).toBe('Kim Guide')
    expect(formatGuideDisplayName({ full_name: '', email: 'g@t.com' })).toBe('g@t.com')
  })

  it('returns 이름 없음 when all empty', () => {
    expect(formatGuideDisplayName({})).toBe('이름 없음')
    expect(formatGuideDisplayName(null)).toBe('이름 없음')
  })
})
