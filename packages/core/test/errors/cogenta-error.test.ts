import { describe, expect, it } from 'vitest'
import { CogentaError, isCogentaError } from '../../src/errors/index.js'

describe('CogentaError', () => {
  it('carries a stable code that callers can branch on', () => {
    const error = new CogentaError({ code: 'CONFIG_INVALID', message: 'bad config' })

    expect(error.code).toBe('CONFIG_INVALID')
    expect(error.message).toBe('bad config')
    expect(error.name).toBe('CogentaError')
  })

  it('is a real Error, so stack traces and instanceof keep working', () => {
    const error = new CogentaError({ code: 'DB_UNREACHABLE', message: 'no database' })

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(CogentaError)
    expect(error.stack).toContain('CogentaError')
  })

  it('tells the user what to do through the hint', () => {
    const error = new CogentaError({
      code: 'CONFIG_INVALID',
      message: 'site.url is not a valid URL',
      hint: 'Set site.url in cogenta.config.ts, or the COGENTA_SITE_URL variable.',
    })

    expect(error.hint).toBe('Set site.url in cogenta.config.ts, or the COGENTA_SITE_URL variable.')
  })

  it('leaves hint and details undefined rather than inventing empty values', () => {
    const error = new CogentaError({ code: 'CONFIG_INVALID', message: 'bad config' })

    expect(error.hint).toBeUndefined()
    expect(error.details).toBeUndefined()
  })

  it('preserves the underlying cause for debugging', () => {
    const cause = new TypeError('connect ECONNREFUSED')
    const error = new CogentaError({ code: 'DB_UNREACHABLE', message: 'no database', cause })

    expect(error.cause).toBe(cause)
  })

  it('serialises to a structured object without the stack', () => {
    const error = new CogentaError({
      code: 'DRIVER_UNAVAILABLE',
      message: 'redis did not answer',
      hint: 'Start Redis, or remove the cache.driver entry to fall back to files.',
      details: { driver: 'redis', tier: 'optimal' },
    })

    expect(error.toJSON()).toEqual({
      name: 'CogentaError',
      code: 'DRIVER_UNAVAILABLE',
      message: 'redis did not answer',
      hint: 'Start Redis, or remove the cache.driver entry to fall back to files.',
      details: { driver: 'redis', tier: 'optimal' },
    })
  })

  it('never leaks a secret through details, because details are opt-in per call', () => {
    // Guards rule R7 by construction: nothing is copied from the environment.
    const error = new CogentaError({ code: 'CONFIG_INVALID', message: 'bad config' })

    expect(JSON.stringify(error.toJSON())).not.toContain('password')
  })
})

describe('isCogentaError', () => {
  it('recognises a CogentaError', () => {
    expect(isCogentaError(new CogentaError({ code: 'CONFIG_INVALID', message: 'x' }))).toBe(true)
  })

  it('rejects a plain Error, a look-alike object, and non-objects', () => {
    expect(isCogentaError(new Error('x'))).toBe(false)
    expect(isCogentaError({ code: 'CONFIG_INVALID', message: 'x' })).toBe(false)
    expect(isCogentaError(null)).toBe(false)
    expect(isCogentaError('CONFIG_INVALID')).toBe(false)
  })
})
