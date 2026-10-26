import type { TFunction } from 'i18next'
import { ApiError } from '../api/http.js'

/**
 * A shop error, in the admin's own language.
 *
 * The server writes its messages in English (they are also logged, and read by
 * API clients), so the admin never shows them: it looks the error's stable
 * `code` up in `commerceErrors.<CODE>` and shows that. `fallback` is the key of
 * a screen-specific sentence for anything the table does not know — a network
 * failure, or a code added after this table was written.
 */
export function commerceErrorMessage(t: TFunction, caught: unknown, fallback: string): string {
  if (caught instanceof ApiError) {
    const key = `commerceErrors.${caught.code}`
    const translated = t(key)
    // A missing key comes back as the key itself.
    if (translated !== key) return translated
  }
  return t(fallback)
}
