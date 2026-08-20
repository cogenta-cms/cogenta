// cogenta:allow-fake-credentials — this file must contain credential-shaped
// strings to prove that redaction catches them. None of them is a real key.

import { describe, expect, it } from 'vitest'
import { CogentaError } from '../../src/errors/index.js'
import { createErrorLog } from '../../src/logger/index.js'

describe('createErrorLog', () => {
  it('records the newest entry first', () => {
    const log = createErrorLog()
    log.record({ code: 'INTERNAL', message: 'first' })
    log.record({ code: 'INTERNAL', message: 'second' })

    const entries = log.entries()
    expect(entries.map((entry) => entry.message)).toEqual(['second', 'first'])
  })

  it('evicts the oldest entry once capacity is exceeded', () => {
    const log = createErrorLog({ capacity: 2 })
    log.record({ code: 'INTERNAL', message: 'oldest' })
    log.record({ code: 'INTERNAL', message: 'middle' })
    log.record({ code: 'INTERNAL', message: 'newest' })

    const entries = log.entries()
    expect(entries).toHaveLength(2)
    expect(entries.map((entry) => entry.message)).toEqual(['newest', 'middle'])
  })

  it('redacts a password embedded in a connection string', () => {
    const log = createErrorLog()
    log.record({
      code: 'DB_UNREACHABLE',
      message: 'postgres://user:hunter2please@host/db',
    })

    expect(log.entries()[0]?.message).not.toContain('hunter2please')
  })

  it('redacts a secret in the context', () => {
    const log = createErrorLog()
    log.record({
      code: 'INTERNAL',
      message: 'request failed',
      context: { apiKey: 'sk-ant-abcdefghijklmnopqrstuvwx' },
    })

    expect(JSON.stringify(log.entries()[0]?.context)).not.toContain('abcdefghijklmnopqrstuvwx')
  })

  it('recordError takes the code and stack from a CogentaError', () => {
    const log = createErrorLog()
    const error = new CogentaError({ code: 'CONTENT_NOT_FOUND', message: 'no such entry' })
    log.recordError(error, { path: '/api/content/x' })

    const entry = log.entries()[0]
    expect(entry?.code).toBe('CONTENT_NOT_FOUND')
    expect(entry?.message).toBe('no such entry')
    expect(entry?.context).toEqual({ path: '/api/content/x' })
  })

  it('recordError falls back to INTERNAL for a plain Error', () => {
    const log = createErrorLog()
    log.recordError(new Error('boom'))

    expect(log.entries()[0]?.code).toBe('INTERNAL')
    expect(log.entries()[0]?.message).toBe('boom')
  })

  it('clear empties the log', () => {
    const log = createErrorLog()
    log.record({ code: 'INTERNAL', message: 'x' })
    log.clear()

    expect(log.entries()).toEqual([])
  })
})
