import { isCogentaError } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createPermissionLayer,
  createPreviewTokens,
  MAX_PREVIEW_LIFETIME_SECONDS,
  PREVIEW_SIGNING_KEY_ENV,
  previewCovers,
} from '../../src/access/index.js'
import type { AccessContext } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'
import { article, COLLECTIONS, page } from './collections.js'

const KEY = 'a'.repeat(64)
const OTHER_KEY = 'b'.repeat(64)
const NOW = 1_760_000_000_000

function codeOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (!isCogentaError(error)) throw error
    return error.code
  }
  throw new Error('expected the call to throw a CogentaError')
}

const tokens = createPreviewTokens({ signingKey: KEY, now: () => NOW })

describe('issuing a preview token', () => {
  it('grants exactly one entry of one collection, with an expiry', () => {
    const { grant } = tokens.issue({ collection: 'article', entryId: 'entry-a', expiresIn: 3600 })
    expect(grant).toEqual({
      collection: 'article',
      entryId: 'entry-a',
      expiresAt: NOW + 3_600_000,
    })
  })

  it('produces a token that carries no secret material', () => {
    const { token } = tokens.issue({ collection: 'article', entryId: 'entry-a', expiresIn: 60 })
    expect(token).not.toContain(KEY)
  })

  it('refuses a lifetime that is zero, negative or not a number', () => {
    for (const expiresIn of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(codeOf(() => tokens.issue({ collection: 'article', entryId: 'a', expiresIn }))).toBe(
        'CONFIG_INVALID',
      )
    }
  })

  it('refuses a lifetime beyond the maximum, so no link lives forever', () => {
    expect(
      codeOf(() =>
        tokens.issue({
          collection: 'article',
          entryId: 'entry-a',
          expiresIn: MAX_PREVIEW_LIFETIME_SECONDS + 1,
        }),
      ),
    ).toBe('CONFIG_INVALID')
  })

  it('refuses a token that names no entry', () => {
    expect(codeOf(() => tokens.issue({ collection: 'article', entryId: '', expiresIn: 60 }))).toBe(
      'PREVIEW_TOKEN_INVALID',
    )
  })
})

describe('verifying a preview token', () => {
  it('returns the grant it was issued for', () => {
    const { token, grant } = tokens.issue({
      collection: 'article',
      entryId: 'entry-a',
      expiresIn: 600,
    })
    expect(tokens.verify(token)).toEqual(grant)
  })

  it('refuses a token that has expired', () => {
    const { token } = tokens.issue({ collection: 'article', entryId: 'entry-a', expiresIn: 60 })
    const later = createPreviewTokens({ signingKey: KEY, now: () => NOW + 61_000 })
    expect(codeOf(() => later.verify(token))).toBe('PREVIEW_TOKEN_EXPIRED')
  })

  it('refuses a token exactly at its expiry instant', () => {
    const { token } = tokens.issue({ collection: 'article', entryId: 'entry-a', expiresIn: 60 })
    const atExpiry = createPreviewTokens({ signingKey: KEY, now: () => NOW + 60_000 })
    expect(codeOf(() => atExpiry.verify(token))).toBe('PREVIEW_TOKEN_EXPIRED')
  })

  it('refuses a token signed with another key', () => {
    const foreign = createPreviewTokens({ signingKey: OTHER_KEY, now: () => NOW })
    const { token } = foreign.issue({ collection: 'article', entryId: 'entry-a', expiresIn: 600 })
    expect(codeOf(() => tokens.verify(token))).toBe('PREVIEW_TOKEN_INVALID')
  })

  it('refuses a truncated token without comparing signatures of different lengths', () => {
    const { token } = tokens.issue({ collection: 'article', entryId: 'entry-a', expiresIn: 600 })
    for (const cut of [1, 5, 20, token.length - 1]) {
      expect(codeOf(() => tokens.verify(token.slice(0, cut)))).toBe('PREVIEW_TOKEN_INVALID')
    }
  })

  it('refuses a token whose payload was edited to point at another entry', () => {
    const { token } = tokens.issue({ collection: 'article', entryId: 'entry-a', expiresIn: 600 })
    const [encoded, signature] = token.split('.')
    if (encoded === undefined || signature === undefined) throw new Error('malformed fixture')

    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      entryId: string
    }
    payload.entryId = 'entry-b'
    const forged = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')

    expect(codeOf(() => tokens.verify(`${forged}.${signature}`))).toBe('PREVIEW_TOKEN_INVALID')
  })

  it('refuses a token whose expiry was pushed into the future', () => {
    const { token } = tokens.issue({ collection: 'article', entryId: 'entry-a', expiresIn: 600 })
    const [encoded, signature] = token.split('.')
    if (encoded === undefined || signature === undefined) throw new Error('malformed fixture')

    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      expiresAt: number
    }
    payload.expiresAt = NOW + 10 * 365 * 24 * 3_600_000
    const forged = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')

    expect(codeOf(() => tokens.verify(`${forged}.${signature}`))).toBe('PREVIEW_TOKEN_INVALID')
  })

  it('refuses garbage that has no signature at all', () => {
    for (const garbage of ['', '.', 'not-a-token', 'a.', '.b']) {
      expect(codeOf(() => tokens.verify(garbage))).toBe('PREVIEW_TOKEN_INVALID')
    }
  })

  it('says nothing about the expected signature in its message', () => {
    const foreign = createPreviewTokens({ signingKey: OTHER_KEY, now: () => NOW })
    const { token } = foreign.issue({ collection: 'article', entryId: 'entry-a', expiresIn: 600 })
    try {
      tokens.verify(token)
      expect.unreachable('a foreign signature must be refused')
    } catch (error) {
      if (!isCogentaError(error)) throw error
      expect(error.message).not.toContain(KEY)
      expect(error.details).toBeUndefined()
    }
  })
})

describe('the signing key', () => {
  const saved = process.env[PREVIEW_SIGNING_KEY_ENV]

  afterEach(() => {
    if (saved === undefined) delete process.env[PREVIEW_SIGNING_KEY_ENV]
    else process.env[PREVIEW_SIGNING_KEY_ENV] = saved
  })

  it('comes from the environment, never from a configuration file', () => {
    process.env[PREVIEW_SIGNING_KEY_ENV] = KEY
    const fromEnvironment = createPreviewTokens({ now: () => NOW })
    const { token, grant } = tokens.issue({
      collection: 'article',
      entryId: 'entry-a',
      expiresIn: 600,
    })
    expect(fromEnvironment.verify(token)).toEqual(grant)
  })

  it('refuses to build a service when the environment holds no key', () => {
    delete process.env[PREVIEW_SIGNING_KEY_ENV]
    expect(codeOf(() => createPreviewTokens())).toBe('CONFIG_INVALID')
  })

  it('refuses a key too short to resist guessing', () => {
    expect(codeOf(() => createPreviewTokens({ signingKey: 'short' }))).toBe('CONFIG_INVALID')
  })
})

describe('a verified token feeding the permission layer', () => {
  const layer = createPermissionLayer({ collections: COLLECTIONS, now: () => NOW })

  it('lets an anonymous visitor read the granted draft, and nothing else', () => {
    const { token } = tokens.issue({ collection: 'article', entryId: 'entry-a', expiresIn: 600 })
    const context: AccessContext = { actor: ANONYMOUS, preview: tokens.verify(token) }

    expect(layer.canReadUnpublished(article, context).allowed).toBe(true)
    expect(previewCovers(context, article, 'entry-a', () => NOW)).toBe(true)
    expect(previewCovers(context, article, 'entry-b', () => NOW)).toBe(false)
    expect(layer.canReadUnpublished(page, context).allowed).toBe(false)
    expect(layer.can('update', article, context).allowed).toBe(false)
  })

  it('gives nothing at all once the grant has expired', () => {
    const { grant } = tokens.issue({ collection: 'article', entryId: 'entry-a', expiresIn: 600 })
    const context: AccessContext = { actor: ANONYMOUS, preview: grant }
    const later = createPermissionLayer({
      collections: COLLECTIONS,
      now: () => grant.expiresAt + 1,
    })

    expect(later.canReadUnpublished(article, context).allowed).toBe(false)
    expect(later.can('read', page, context).allowed).toBe(false)
    expect(previewCovers(context, article, 'entry-a', () => grant.expiresAt + 1)).toBe(false)
  })
})
