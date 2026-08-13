// cogenta:allow-fake-credentials — this file must contain credential-shaped
// strings to prove that redaction catches them. None of them is a real key.

import { describe, expect, it } from 'vitest'
import { REDACTED, redact } from '../../src/logger/index.js'

describe('redact — by key name', () => {
  it.each([
    'password',
    'passwd',
    'secret',
    'token',
    'apiKey',
    'api_key',
    'authorization',
    'cookie',
    'privateKey',
    'clientSecret',
    'accessKeyId',
    'secretAccessKey',
    'refreshToken',
    'sessionId',
  ])('redacts %s', (key) => {
    expect(redact({ [key]: 'hunter2please' })).toEqual({ [key]: REDACTED })
  })

  it('matches whatever the casing and separators are', () => {
    expect(redact({ API_KEY: 'x', 'x-api-key': 'y', llmApiKey: 'z' })).toEqual({
      API_KEY: REDACTED,
      'x-api-key': REDACTED,
      llmApiKey: REDACTED,
    })
  })

  it('leaves fields that merely look related, because agents log them constantly', () => {
    // Budgets are counted in tokens (contract C). Redacting them would make the
    // whole budget subsystem unobservable.
    const fields = { tokens: 1200, tokensPerDay: 200_000, cacheKey: 'page:home', keyCount: 3 }

    expect(redact(fields)).toEqual(fields)
  })
})

describe('redact — by value shape', () => {
  it.each([
    ['sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz01', 'an Anthropic key'],
    ['AKIAIOSFODNN7EXAMPLE', 'an AWS access key id'],
    ['ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', 'a GitHub token'],
    ['-----BEGIN PRIVATE KEY-----', 'a private key block'],
  ])('redacts %s even under an innocent key name (%s)', (value) => {
    expect(redact({ note: value })).toEqual({ note: REDACTED })
  })

  it('keeps ordinary strings intact', () => {
    expect(redact({ note: 'published the article' })).toEqual({ note: 'published the article' })
  })
})

describe('redact — connection strings', () => {
  it('strips the password but keeps the URL readable, because that is what debugging needs', () => {
    expect(redact({ url: 'postgres://app:s3cr3t@db.internal:5432/cogenta' })).toEqual({
      url: `postgres://app:${REDACTED}@db.internal:5432/cogenta`,
    })
  })

  it('leaves a URL without credentials alone', () => {
    expect(redact({ url: 'postgres://db.internal:5432/cogenta' })).toEqual({
      url: 'postgres://db.internal:5432/cogenta',
    })
  })
})

describe('redact — structure', () => {
  it('reaches into nested objects and arrays', () => {
    const result = redact({
      driver: 'redis',
      connections: [{ url: 'redis://user:pw123456@cache:6379' }],
      llm: { provider: 'anthropic', apiKey: 'sk-test' },
    })

    expect(result).toEqual({
      driver: 'redis',
      connections: [{ url: `redis://user:${REDACTED}@cache:6379` }],
      llm: { provider: 'anthropic', apiKey: REDACTED },
    })
  })

  it('does not mutate the object it was given', () => {
    const original = { apiKey: 'sk-test', nested: { token: 'abc' } }
    redact(original)

    expect(original.apiKey).toBe('sk-test')
    expect(original.nested.token).toBe('abc')
  })

  it('survives a circular reference instead of overflowing the stack', () => {
    const node: Record<string, unknown> = { name: 'root' }
    node['self'] = node

    expect(() => redact(node)).not.toThrow()
  })

  it('passes through the primitives a log record actually carries', () => {
    const fields = { count: 3, ok: true, missing: null, absent: undefined, when: 1_700_000_000 }

    expect(redact(fields)).toEqual(fields)
  })
})
