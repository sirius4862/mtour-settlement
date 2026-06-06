import { describe, expect, it } from 'vitest'
import {
  TOUR_REGISTRATION_TEXT_MAX_LENGTH,
  TOUR_REGISTRATION_TEXT_TOO_LONG_ERROR,
  validateCreateTourTextLengths,
} from './create-tour-validation'

const validInput = {
  tour_code: 'DN-2026-0606',
  agency_name: 'M투어',
  pattern: '다낭 호이안',
}

describe('validateCreateTourTextLengths', () => {
  it('rejects tour names longer than 20 characters', () => {
    expect(
      validateCreateTourTextLengths({
        ...validInput,
        pattern: '가'.repeat(TOUR_REGISTRATION_TEXT_MAX_LENGTH + 1),
      }),
    ).toEqual({ ok: false, error: TOUR_REGISTRATION_TEXT_TOO_LONG_ERROR })
  })

  it('rejects tour codes longer than 20 characters', () => {
    expect(
      validateCreateTourTextLengths({
        ...validInput,
        tour_code: 'A'.repeat(TOUR_REGISTRATION_TEXT_MAX_LENGTH + 1),
      }),
    ).toEqual({ ok: false, error: TOUR_REGISTRATION_TEXT_TOO_LONG_ERROR })
  })

  it('rejects agency/company names longer than 20 characters', () => {
    expect(
      validateCreateTourTextLengths({
        ...validInput,
        agency_name: '여'.repeat(TOUR_REGISTRATION_TEXT_MAX_LENGTH + 1),
      }),
    ).toEqual({ ok: false, error: TOUR_REGISTRATION_TEXT_TOO_LONG_ERROR })
  })

  it('allows 20-character values', () => {
    expect(
      validateCreateTourTextLengths({
        tour_code: 'A'.repeat(TOUR_REGISTRATION_TEXT_MAX_LENGTH),
        agency_name: '여'.repeat(TOUR_REGISTRATION_TEXT_MAX_LENGTH),
        pattern: '가'.repeat(TOUR_REGISTRATION_TEXT_MAX_LENGTH),
      }),
    ).toEqual({ ok: true })
  })

  it('allows normal short values', () => {
    expect(validateCreateTourTextLengths(validInput)).toEqual({ ok: true })
  })
})
