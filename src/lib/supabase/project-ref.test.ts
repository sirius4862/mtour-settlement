import { describe, expect, it } from 'vitest'
import {
  PRODUCTION_SUPABASE_REF,
  assertLegacyProductionWorkflowSupabase,
  assertStagingSupabaseNotProduction,
  extractSupabaseProjectRef,
  isProductionSupabaseRef,
} from './project-ref'

describe('supabase project ref guards', () => {
  const prodUrl = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`
  const stagingUrl = 'https://abcdefghijklmnopqrst.supabase.co'

  it('extracts project ref from Supabase URL', () => {
    expect(extractSupabaseProjectRef(prodUrl)).toBe(PRODUCTION_SUPABASE_REF)
    expect(extractSupabaseProjectRef(stagingUrl)).toBe('abcdefghijklmnopqrst')
  })

  it('legacy production workflow guard accepts production only', () => {
    expect(() =>
      assertLegacyProductionWorkflowSupabase(prodUrl, 'test-spec'),
    ).not.toThrow()
    expect(() =>
      assertLegacyProductionWorkflowSupabase(stagingUrl, 'test-spec'),
    ).toThrow(/legacy workflow E2E still requires production ref/)
  })

  it('staging guard refuses production', () => {
    expect(() => assertStagingSupabaseNotProduction(prodUrl, 'test-spec')).toThrow(
      /refusing production ref/,
    )
    expect(() =>
      assertStagingSupabaseNotProduction(stagingUrl, 'test-spec'),
    ).not.toThrow()
  })

  it('isProductionSupabaseRef identifies production ref only', () => {
    expect(isProductionSupabaseRef(PRODUCTION_SUPABASE_REF)).toBe(true)
    expect(isProductionSupabaseRef('abcdefghijklmnopqrst')).toBe(false)
  })
})
