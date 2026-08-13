// cogenta:allow-fake-credentials — this file must contain credential-shaped
// strings to prove that redaction catches them. None of them is a real key.

import { beforeEach, describe, expect, it } from 'vitest'
import { CogentaError } from '../../src/errors/index.js'
import type { LogRecord } from '../../src/logger/index.js'
import { createLogger, REDACTED } from '../../src/logger/index.js'

/** Captures what would have been written, parsed back from the emitted line. */
function collector(): { lines: string[]; write: (line: string) => void } {
  const lines: string[] = []
  return { lines, write: (line) => lines.push(line) }
}

const clock = (): Date => new Date('2026-08-13T10:00:00.000Z')

let sink: ReturnType<typeof collector>

beforeEach(() => {
  sink = collector()
})

function records(): LogRecord[] {
  return sink.lines.map((line) => JSON.parse(line) as LogRecord)
}

describe('createLogger — output', () => {
  it('writes one JSON object per line, never free text', () => {
    const logger = createLogger({ destination: sink.write, clock })
    logger.info('site published')

    expect(sink.lines).toHaveLength(1)
    expect(sink.lines[0]?.endsWith('\n')).toBe(true)
    expect(() => JSON.parse(sink.lines[0] ?? '')).not.toThrow()
  })

  it('carries the level, the message and an ISO timestamp', () => {
    const logger = createLogger({ destination: sink.write, clock })
    logger.warn('redis did not answer')

    expect(records()[0]).toMatchObject({
      level: 'warn',
      msg: 'redis did not answer',
      time: '2026-08-13T10:00:00.000Z',
    })
  })

  it('merges structured fields at the top level', () => {
    const logger = createLogger({ destination: sink.write, clock })
    logger.info('driver selected', { driver: 'database', tier: 'degraded' })

    expect(records()[0]).toMatchObject({ driver: 'database', tier: 'degraded' })
  })

  it('refuses to let a field overwrite the record structure', () => {
    const logger = createLogger({ destination: sink.write, clock })
    logger.info('hello', { level: 'error', msg: 'spoofed', time: 'yesterday' })

    expect(records()[0]).toMatchObject({
      level: 'info',
      msg: 'hello',
      time: '2026-08-13T10:00:00.000Z',
    })
  })
})

describe('createLogger — levels', () => {
  it('drops everything below the configured level', () => {
    const logger = createLogger({ level: 'warn', destination: sink.write, clock })
    logger.debug('noise')
    logger.info('noise')
    logger.warn('kept')
    logger.error('kept')

    expect(records().map((r) => r.level)).toEqual(['warn', 'error'])
  })

  it('defaults to info, so debug output never leaks into production logs', () => {
    const logger = createLogger({ destination: sink.write, clock })
    logger.debug('noise')

    expect(sink.lines).toHaveLength(0)
  })

  it('reports whether a level is enabled, so callers can skip expensive work', () => {
    const logger = createLogger({ level: 'warn', destination: sink.write, clock })

    expect(logger.isLevelEnabled('debug')).toBe(false)
    expect(logger.isLevelEnabled('error')).toBe(true)
  })

  it('silences everything at level silent', () => {
    const logger = createLogger({ level: 'silent', destination: sink.write, clock })
    logger.error('not even this')

    expect(sink.lines).toHaveLength(0)
  })
})

describe('createLogger — child loggers', () => {
  it('carries the parent bindings into every record', () => {
    const logger = createLogger({ destination: sink.write, clock }).child({ site: 'blog' })
    logger.info('published')

    expect(records()[0]).toMatchObject({ site: 'blog' })
  })

  it('lets a child add bindings without touching its parent', () => {
    const parent = createLogger({ destination: sink.write, clock }).child({ site: 'blog' })
    const child = parent.child({ agent: 'security' })

    child.info('scan started')
    parent.info('unrelated')

    expect(records()[0]).toMatchObject({ site: 'blog', agent: 'security' })
    expect(records()[1]).not.toHaveProperty('agent')
  })

  it('redacts bindings too, not only per-call fields', () => {
    const logger = createLogger({ destination: sink.write, clock }).child({ apiKey: 'sk-test' })
    logger.info('ready')

    expect(records()[0]).toMatchObject({ apiKey: REDACTED })
  })
})

describe('createLogger — errors', () => {
  it('serialises a CogentaError with its code and hint', () => {
    const logger = createLogger({ destination: sink.write, clock })
    logger.error('startup failed', {
      error: new CogentaError({
        code: 'CONFIG_INVALID',
        message: 'site.url is not a valid URL',
        hint: 'Set COGENTA_SITE_URL.',
      }),
    })

    expect(records()[0]?.['error']).toMatchObject({
      name: 'CogentaError',
      code: 'CONFIG_INVALID',
      message: 'site.url is not a valid URL',
      hint: 'Set COGENTA_SITE_URL.',
    })
  })

  it('serialises a plain Error without losing it to JSON.stringify', () => {
    const logger = createLogger({ destination: sink.write, clock })
    logger.error('boom', { error: new TypeError('connect ECONNREFUSED') })

    expect(records()[0]?.['error']).toMatchObject({
      name: 'TypeError',
      message: 'connect ECONNREFUSED',
    })
  })
})

describe('createLogger — no secret reaches the output', () => {
  it('redacts a secret passed as a field', () => {
    const logger = createLogger({ destination: sink.write, clock })
    logger.info('llm configured', { apiKey: 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz01' })

    expect(sink.lines[0]).not.toContain('sk-ant-api03')
    expect(records()[0]).toMatchObject({ apiKey: REDACTED })
  })

  it('redacts a password inside a connection string', () => {
    const logger = createLogger({ destination: sink.write, clock })
    logger.info('database connected', { url: 'postgres://app:s3cr3t@db:5432/cogenta' })

    expect(sink.lines[0]).not.toContain('s3cr3t')
  })

  it('redacts a secret hidden under an innocent key name', () => {
    const logger = createLogger({ destination: sink.write, clock })
    logger.info('note', { comment: 'the key is ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789' })

    expect(sink.lines[0]).not.toContain('ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789')
  })

  it('never throws on a value JSON cannot serialise, because logging must not break callers', () => {
    const logger = createLogger({ destination: sink.write, clock })

    expect(() => logger.info('odd', { big: 10n, fn: () => undefined })).not.toThrow()
    expect(sink.lines).toHaveLength(1)
  })
})
