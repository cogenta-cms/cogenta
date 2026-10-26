import i18next from 'i18next'
import { ApiError } from './http.js'

/**
 * What a screen needs to tell a person what went wrong and, when the server
 * said so, what to do about it.
 */
export interface ApiErrorDescription {
  readonly message: string
  readonly hint?: string
}

/**
 * Turns a caught value into `{ message, hint }` a screen can render.
 *
 * Every `CogentaError` the server throws already carries a `hint` — "what to
 * do, where to put it" (AGENTS.md: "Une erreur destinée à l'utilisateur final
 * dit ce qui a échoué, pourquoi, et quoi faire") — and `ApiError` (`http.ts`)
 * already threads it through from the response body. The anti-pattern this
 * replaces, `caught instanceof ApiError ? caught.message : t(fallbackKey)`,
 * reads `message` and throws `hint` away; it was found 178 times across 51
 * files in `packages/admin/src/routes` (fiche 40). This is the fix, made
 * reusable rather than repeated a 179th time — `import.tsx`'s own
 * `describeError`, promoted here unchanged in shape so no caller's rendering
 * code needs to change, only its import.
 *
 * `fallback` is only used for a caught value that never reached the network
 * layer as a diagnosed failure (a thrown non-`ApiError`, e.g. a bug or an
 * aborted fetch) — `ApiError` always yields its own `message`, in the
 * server's own words, since the server already wrote it to be shown.
 */
export function describeApiError(caught: unknown, fallback: string): ApiErrorDescription {
  if (!(caught instanceof ApiError)) return { message: fallback }
  // Some refusals reach an editor often enough, and in words technical enough
  // ("the shape this suggestion needs"), that the server's English is not what
  // should be on screen. A code with an `apiErrors.<CODE>` entry is shown in
  // the admin's own language; every other code keeps the server's words.
  const messageKey = `apiErrors.${caught.code}.message`
  if (i18next.exists(messageKey)) {
    const hintKey = `apiErrors.${caught.code}.hint`
    return {
      message: i18next.t(messageKey),
      ...(i18next.exists(hintKey) ? { hint: i18next.t(hintKey) } : {}),
    }
  }
  return { message: caught.message, ...(caught.hint === undefined ? {} : { hint: caught.hint }) }
}
