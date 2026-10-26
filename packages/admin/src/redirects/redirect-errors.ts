import type { TFunction } from 'i18next'
import { ApiError } from '../api/http.js'

/**
 * The text shown for a failed redirect call, in the language of the
 * interface.
 *
 * The server's own `message`/`hint` are English sentences written for API
 * callers (and they can quote a path or a file the editor never typed), so
 * they are never shown here: the stable `code` picks a French sentence, and
 * a code this screen has no wording for falls back to the caller's generic
 * "could not be done" sentence.
 */
export function redirectErrorMessage(caught: unknown, fallbackKey: string, t: TFunction): string {
  if (caught instanceof ApiError) {
    switch (caught.code) {
      case 'CONTENT_REDIRECT_LOOP':
        return t('redirects.errors.loop')
      case 'CONTENT_ROUTE_INVALID':
        return t('redirects.errors.invalidPath')
      case 'REDIRECT_UNKNOWN':
        return t('redirects.errors.unknown')
      case 'FORBIDDEN':
        return t('redirects.adminOnly')
      default:
        break
    }
  }
  return t(fallbackKey)
}

export type PathProblem = 'empty' | 'noSlash' | 'scheme' | 'doubleSlash'

/**
 * Checks a typed path before it is sent. The server stays the authority —
 * it refuses the same things — but a value like `javascript:alert(1)` or
 * `sans-slash` deserves a sentence that names the problem rather than a
 * silent correction or a generic failure.
 */
export function pathProblem(value: string): PathProblem | null {
  const trimmed = value.trim()
  if (trimmed === '') return 'empty'
  if (/^[a-z][a-z0-9+.-]*:/iu.test(trimmed)) return 'scheme'
  if (!trimmed.startsWith('/')) return 'noSlash'
  if (trimmed.startsWith('//')) return 'doubleSlash'
  return null
}
