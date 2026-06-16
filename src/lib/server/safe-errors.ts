/**
 * Maps internal/DB errors to safe user-facing messages.
 * Detailed errors are logged server-side only.
 */
/** Non-blocking server warning for monitoring/tripwire (never throws). */
export function logServerWarning(
  context: string,
  extra?: Record<string, unknown>,
): void {
  console.warn(context, extra ?? {})
}

export function logServerError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  const payload =
    error && typeof error === 'object'
      ? {
          message: 'message' in error ? (error as { message?: string }).message : undefined,
          code: 'code' in error ? (error as { code?: string }).code : undefined,
          details: 'details' in error ? (error as { details?: string }).details : undefined,
          hint: 'hint' in error ? (error as { hint?: string }).hint : undefined,
        }
      : { raw: error }
  console.error(context, { ...extra, ...payload })
}

export const SUBMIT_SETTLEMENT_GENERIC_ERROR =
  '정산서 제출에 실패했습니다. 잠시 후 다시 시도해 주세요.'

export const SUBMIT_SETTLEMENT_VERIFY_ERROR =
  '제출이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.'

export const SAVE_SETTLEMENT_GENERIC_ERROR =
  '정산서 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.'
