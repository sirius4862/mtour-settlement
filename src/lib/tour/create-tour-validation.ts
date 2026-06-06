export const TOUR_REGISTRATION_TEXT_MAX_LENGTH = 20

export const TOUR_REGISTRATION_TEXT_TOO_LONG_ERROR = '입력값이 너무 깁니다.'

export interface CreateTourTextFields {
  tour_code: string
  agency_name: string
  pattern: string
}

export function validateCreateTourTextLengths(
  input: CreateTourTextFields,
): { ok: true } | { ok: false; error: string } {
  const values = [input.tour_code, input.agency_name, input.pattern]
  if (values.some((value) => value.trim().length > TOUR_REGISTRATION_TEXT_MAX_LENGTH)) {
    return { ok: false, error: TOUR_REGISTRATION_TEXT_TOO_LONG_ERROR }
  }
  return { ok: true }
}
