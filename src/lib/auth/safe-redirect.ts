/** Fallback redirect target for an unsafe/invalid `next` value. */
export const DEFAULT_REDIRECT_PATH = '/'

/** Legacy post-login target used when the `next` parameter is entirely absent. */
export const MISSING_NEXT_REDIRECT_PATH = '/guide'

/**
 * Validate an auth-callback `next` redirect target, allowing only safe same-site
 * relative paths and falling back to `/` for anything else.
 *
 * A value is accepted only when it:
 *   • is a string that starts with exactly one `/`,
 *   • does NOT start with `//` (protocol-relative, e.g. `//evil.com`),
 *   • does NOT start with `/\` or `/%2f` etc. that browsers may treat as
 *     protocol-relative,
 *   • contains no control characters.
 *
 * Absolute URLs (`https://evil.com`), protocol-relative URLs (`//evil.com`),
 * missing values, and malformed values all fall back to `/`.
 */
export function sanitizeNextPath(next: string | null | undefined): string {
  if (typeof next !== 'string') return DEFAULT_REDIRECT_PATH
  if (next.length === 0) return DEFAULT_REDIRECT_PATH

  // Must be a relative path rooted at a single `/`.
  if (next[0] !== '/') return DEFAULT_REDIRECT_PATH

  // Reject protocol-relative (`//`) and backslash-bypass (`/\`) forms.
  const second = next[1]
  if (second === '/' || second === '\\') return DEFAULT_REDIRECT_PATH

  // Reject control characters (incl. newlines/tabs) that could enable smuggling.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(next)) return DEFAULT_REDIRECT_PATH

  // Reject encoded leading slash (e.g. `/%2fevil.com`) which can resolve oddly.
  if (/^\/%2f/i.test(next)) return DEFAULT_REDIRECT_PATH

  return next
}

/**
 * Resolve the auth-callback redirect target from the raw `next` query value.
 *
 *   • absent (`null`)  → `/guide` (preserves legacy post-login behavior)
 *   • present + safe   → the validated relative path
 *   • present + unsafe → `/` (blocks open redirects)
 */
export function resolveCallbackRedirect(rawNext: string | null): string {
  if (rawNext === null) return MISSING_NEXT_REDIRECT_PATH
  return sanitizeNextPath(rawNext)
}
