import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REDIRECT_PATH,
  MISSING_NEXT_REDIRECT_PATH,
  resolveCallbackRedirect,
  sanitizeNextPath,
} from './safe-redirect'

describe('sanitizeNextPath', () => {
  it('preserves valid same-site relative paths', () => {
    for (const path of [
      '/admin',
      '/guide',
      '/admin/tours?view=all',
      '/admin/settlements/123',
      '/guide/settlements/new#section',
    ]) {
      expect(sanitizeNextPath(path)).toBe(path)
    }
  })

  it('returns strict fallback / for empty/null/undefined (no /guide here)', () => {
    expect(sanitizeNextPath(null)).toBe(DEFAULT_REDIRECT_PATH)
    expect(sanitizeNextPath(undefined)).toBe(DEFAULT_REDIRECT_PATH)
    expect(sanitizeNextPath('')).toBe(DEFAULT_REDIRECT_PATH)
    expect(DEFAULT_REDIRECT_PATH).toBe('/')
  })

  it('falls back to / for absolute external URLs', () => {
    for (const url of [
      'https://evil.com',
      'http://evil.com/admin',
      'https://evil.com?next=/admin',
      'ftp://evil.com',
    ]) {
      expect(sanitizeNextPath(url)).toBe(DEFAULT_REDIRECT_PATH)
    }
  })

  it('falls back to / for protocol-relative URLs', () => {
    expect(sanitizeNextPath('//evil.com')).toBe(DEFAULT_REDIRECT_PATH)
    expect(sanitizeNextPath('//evil.com/path')).toBe(DEFAULT_REDIRECT_PATH)
  })

  it('falls back to / for backslash and encoded-slash bypass attempts', () => {
    expect(sanitizeNextPath('/\\evil.com')).toBe(DEFAULT_REDIRECT_PATH)
    expect(sanitizeNextPath('/%2fevil.com')).toBe(DEFAULT_REDIRECT_PATH)
    expect(sanitizeNextPath('/%2Fevil.com')).toBe(DEFAULT_REDIRECT_PATH)
  })

  it('falls back to / for malformed values (no leading slash or control chars)', () => {
    expect(sanitizeNextPath('admin')).toBe(DEFAULT_REDIRECT_PATH)
    expect(sanitizeNextPath('javascript:alert(1)')).toBe(DEFAULT_REDIRECT_PATH)
    expect(sanitizeNextPath('/admin\nSet-Cookie: x=1')).toBe(DEFAULT_REDIRECT_PATH)
    expect(sanitizeNextPath('/admin\tfoo')).toBe(DEFAULT_REDIRECT_PATH)
  })

  it('rejects non-string inputs', () => {
    // @ts-expect-error runtime guard for unexpected types
    expect(sanitizeNextPath(123)).toBe(DEFAULT_REDIRECT_PATH)
    // @ts-expect-error runtime guard for unexpected types
    expect(sanitizeNextPath({})).toBe(DEFAULT_REDIRECT_PATH)
  })
})

describe('resolveCallbackRedirect (auth callback policy)', () => {
  it('redirects to /guide when next is absent (legacy behavior preserved)', () => {
    expect(resolveCallbackRedirect(null)).toBe('/guide')
    expect(resolveCallbackRedirect(null)).toBe(MISSING_NEXT_REDIRECT_PATH)
  })

  it('preserves valid relative paths unchanged', () => {
    for (const path of ['/admin', '/guide', '/admin/tours?view=all', '/admin/settlements/123']) {
      expect(resolveCallbackRedirect(path)).toBe(path)
    }
  })

  it('falls back to / for absolute external URLs', () => {
    expect(resolveCallbackRedirect('https://evil.com')).toBe('/')
    expect(resolveCallbackRedirect('http://evil.com/admin')).toBe('/')
  })

  it('falls back to / for protocol-relative URLs', () => {
    expect(resolveCallbackRedirect('//evil.com')).toBe('/')
  })

  it('falls back to / for backslash and encoded-slash bypass attempts', () => {
    expect(resolveCallbackRedirect('/\\evil.com')).toBe('/')
    expect(resolveCallbackRedirect('/%2fevil.com')).toBe('/')
  })

  it('falls back to / for malformed values (no leading slash, control chars, empty)', () => {
    expect(resolveCallbackRedirect('admin')).toBe('/')
    expect(resolveCallbackRedirect('javascript:alert(1)')).toBe('/')
    expect(resolveCallbackRedirect('/admin\nSet-Cookie: x=1')).toBe('/')
    expect(resolveCallbackRedirect('')).toBe('/')
  })
})
