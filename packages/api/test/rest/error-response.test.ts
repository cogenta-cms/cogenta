import { CogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { errorResponse } from '../../src/rest/http.js'

describe('errorResponse', () => {
  it('answers 400 QUERY_INVALID to a malformed percent-escape, not 500', () => {
    let thrown: unknown
    try {
      decodeURIComponent('%')
    } catch (error) {
      thrown = error
    }
    const response = errorResponse(thrown)
    expect(response.status).toBe(400)
    expect((response.body as { error: { code: string } }).error.code).toBe('QUERY_INVALID')
  })

  it('keeps an unexpected error at 500 with a fixed sentence', () => {
    const response = errorResponse(new Error('connection string postgres://user:secret@host/db'))
    expect(response.status).toBe(500)
    expect(JSON.stringify(response.body)).not.toContain('secret')
  })

  it('announces a rate-limit wait as Retry-After in whole seconds, rounded up', () => {
    const limited = new CogentaError({
      code: 'AUTH_RATE_LIMITED',
      message: 'Too many attempts.',
      details: { retryAfterMs: 900_001 },
    })
    const response = errorResponse(limited)
    expect(response.status).toBe(429)
    expect(response.headers?.['retry-after']).toBe('901')
  })

  it('maps the oversized-body and wrong-media-type codes to 413 and 415', () => {
    const tooLarge = new CogentaError({
      code: 'REQUEST_BODY_TOO_LARGE',
      message: 'too large',
    })
    const wrongType = new CogentaError({
      code: 'REQUEST_UNSUPPORTED_MEDIA_TYPE',
      message: 'json only',
    })
    expect(errorResponse(tooLarge).status).toBe(413)
    expect(errorResponse(wrongType).status).toBe(415)
  })
})
