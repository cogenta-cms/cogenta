import { describe, expect, it } from 'vitest'
import { describeApiError } from '../src/api/describe-error.js'
import { ApiError } from '../src/api/http.js'

/**
 * `describeApiError` (fiche 40 task 2) — the shared replacement for
 * `caught instanceof ApiError ? caught.message : t(fallbackKey)`, the
 * anti-pattern that silently dropped `ApiError.hint` in 178 places across 51
 * files. A screen that migrates to this helper is asserting exactly what
 * these two tests prove: the server's `hint` survives, and a caught value
 * that never reached the network layer falls back cleanly.
 */
describe('describeApiError', () => {
  it('carries both message and hint through for an ApiError that has one', () => {
    const caught = new ApiError(
      'CONFIG_INVALID',
      'Preview tokens need COGENTA_PREVIEW_SIGNING_KEY to hold at least 32 characters.',
      'Set COGENTA_PREVIEW_SIGNING_KEY in the environment — for example `openssl rand -hex 32`. Never put it in a configuration file.',
    )

    const described = describeApiError(caught, 'fallback')

    expect(described.message).toBe(
      'Preview tokens need COGENTA_PREVIEW_SIGNING_KEY to hold at least 32 characters.',
    )
    expect(described.hint).toBe(
      'Set COGENTA_PREVIEW_SIGNING_KEY in the environment — for example `openssl rand -hex 32`. Never put it in a configuration file.',
    )
  })

  it('omits hint (rather than writing undefined) for an ApiError that has none', () => {
    const caught = new ApiError('INTERNAL', 'The request could not be completed.', undefined)

    const described = describeApiError(caught, 'fallback')

    expect(described.message).toBe('The request could not be completed.')
    expect(described.hint).toBeUndefined()
    expect('hint' in described).toBe(false)
  })

  it('falls back to the translated message for a caught value that is not an ApiError', () => {
    const described = describeApiError(new TypeError('boom'), 'fallback message')

    expect(described.message).toBe('fallback message')
    expect(described.hint).toBeUndefined()
  })

  it('falls back for a non-Error thrown value too', () => {
    const described = describeApiError('a plain string was thrown', 'fallback message')

    expect(described.message).toBe('fallback message')
  })
})
