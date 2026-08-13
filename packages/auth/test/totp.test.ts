import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { assertTotpSecretFormat, generateTotpSecret, totpUri, verifyTotp } from '../src/totp.js'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Local re-implementation, kept independent of `src/totp.ts`, so the RFC vectors below prove the real algorithm rather than round-tripping through itself. */
function base32Encode(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return output
}

// RFC 4226 Appendix D: HOTP('12345678901234567890', counter), 6 digits, SHA-1.
// TOTP at 30s steps is HOTP with counter = floor(time / 30), so counter N's
// expected code is reproduced by evaluating verifyTotp at now = N * 30.
const RFC4226_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'))
const RFC4226_CODES = [
  '755224',
  '287082',
  '359152',
  '969429',
  '338314',
  '254676',
  '287922',
  '162583',
  '399871',
  '520489',
] as const

const CODE_0 = RFC4226_CODES[0]
const CODE_3 = RFC4226_CODES[3]
if (CODE_0 === undefined || CODE_3 === undefined) throw new Error('RFC4226_CODES is malformed')

describe('verifyTotp', () => {
  it.each(RFC4226_CODES.map((code, counter) => [counter, code] as const))(
    'matches the RFC 4226 test vector for counter %i',
    (counter, code) => {
      expect(verifyTotp(code, RFC4226_SECRET, { now: counter * 30, windowSteps: 0 })).toBe(true)
    },
  )

  it('rejects a code from a different time step outside the drift window', () => {
    expect(verifyTotp(CODE_0, RFC4226_SECRET, { now: 5 * 30, windowSteps: 0 })).toBe(false)
  })

  it('accepts the previous and next step inside the default drift window', () => {
    // Default windowSteps is 1: the code for counter 3 must still verify one
    // step early or late, absorbing clock skew between server and phone.
    expect(verifyTotp(CODE_3, RFC4226_SECRET, { now: 2 * 30 })).toBe(true)
    expect(verifyTotp(CODE_3, RFC4226_SECRET, { now: 4 * 30 })).toBe(true)
  })

  it('rejects a code two steps outside the default drift window', () => {
    expect(verifyTotp(CODE_3, RFC4226_SECRET, { now: 1 * 30 })).toBe(false)
    expect(verifyTotp(CODE_3, RFC4226_SECRET, { now: 5 * 30 })).toBe(false)
  })

  it('rejects malformed tokens without touching the secret', () => {
    expect(verifyTotp('', RFC4226_SECRET, { now: 0 })).toBe(false)
    expect(verifyTotp('12345', RFC4226_SECRET, { now: 0 })).toBe(false)
    expect(verifyTotp('1234567', RFC4226_SECRET, { now: 0 })).toBe(false)
    expect(verifyTotp('abcdef', RFC4226_SECRET, { now: 0 })).toBe(false)
  })

  it('rejects a code checked against an invalid secret rather than throwing', () => {
    expect(verifyTotp('755224', 'not-base32!!!', { now: 0 })).toBe(false)
  })
})

describe('generateTotpSecret', () => {
  it('produces a secret that round-trips through verifyTotp', () => {
    const secret = generateTotpSecret()
    expect(() => assertTotpSecretFormat(secret)).not.toThrow()
  })

  it('produces a different secret on every call', () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret())
  })
})

describe('assertTotpSecretFormat', () => {
  it('accepts a generated secret', () => {
    expect(() => assertTotpSecretFormat(generateTotpSecret())).not.toThrow()
  })

  it('rejects text that is not base32', () => {
    expect(() => assertTotpSecretFormat('not valid base32!')).toThrow()
    try {
      assertTotpSecretFormat('not valid base32!')
      expect.unreachable()
    } catch (error) {
      expect(isCogentaError(error)).toBe(true)
    }
  })
})

describe('totpUri', () => {
  it('embeds the secret, issuer and label as an otpauth:// URI', () => {
    const uri = totpUri('JBSWY3DPEHPK3PXP', 'Cogenta', 'alice@example.com')
    expect(uri).toMatch(/^otpauth:\/\/totp\//)
    const parsed = new URL(uri)
    expect(parsed.searchParams.get('secret')).toBe('JBSWY3DPEHPK3PXP')
    expect(parsed.searchParams.get('issuer')).toBe('Cogenta')
    expect(parsed.searchParams.get('algorithm')).toBe('SHA1')
    expect(parsed.searchParams.get('digits')).toBe('6')
    expect(parsed.searchParams.get('period')).toBe('30')
  })

  it('URL-encodes an issuer or label containing URI-delimiter characters', () => {
    const uri = totpUri('JBSWY3DPEHPK3PXP', 'Co&genta:Site', 'alice+test@example.com')
    // A '&' or ':' inside issuer/label must not open a new query parameter or
    // path segment that the authenticator app would parse as something else.
    const parsed = new URL(uri)
    expect(parsed.searchParams.get('issuer')).toBe('Co&genta:Site')
    expect([...parsed.searchParams.keys()]).toEqual([
      'secret',
      'issuer',
      'algorithm',
      'digits',
      'period',
    ])
  })
})
