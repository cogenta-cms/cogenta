import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { CogentaError } from '@cogenta/core'

/**
 * TOTP, RFC 6238 over HOTP, RFC 4226 — hand-written rather than a dependency.
 *
 * It is forty lines of HMAC and modular arithmetic with no ambiguity in the
 * spec and no ceremony to get subtly wrong, which is the opposite of WebAuthn:
 * that one is a dependency for exactly the reasons this one is not.
 */

const DIGITS = 6
const PERIOD_SECONDS = 30
const ALGORITHM = 'sha1' // What every authenticator app (contract: RFC 6238 default) expects.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

/**
 * The `otpauth://` URI an authenticator app scans as a QR code.
 *
 * `issuer` and `label` are URL-encoded independently: a site name or a user
 * email containing `&` or `:` must not be able to smuggle extra URI parameters
 * into what the app parses.
 */
export function totpUri(secret: string, issuer: string, label: string): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  })
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?${params.toString()}`
}

function hotp(secret: Buffer, counter: bigint): string {
  const counterBytes = Buffer.alloc(8)
  counterBytes.writeBigUInt64BE(counter)

  const digest = createHmac(ALGORITHM, secret).update(counterBytes).digest()
  const offset = (digest.at(-1) ?? 0) & 0x0f
  const truncated =
    ((digest[offset] ?? 0) & 0x7f) * 2 ** 24 +
    ((digest[offset + 1] ?? 0) & 0xff) * 2 ** 16 +
    ((digest[offset + 2] ?? 0) & 0xff) * 2 ** 8 +
    ((digest[offset + 3] ?? 0) & 0xff)

  return String(truncated % 10 ** DIGITS).padStart(DIGITS, '0')
}

export interface VerifyTotpOptions {
  /** Epoch seconds. Injected so a test never races the real clock. */
  readonly now?: number
  /**
   * Time steps of drift accepted either side of now, to absorb clock skew
   * between the server and a phone that has not synced in a while. 1 means
   * the previous, current and next 30-second window all validate.
   */
  readonly windowSteps?: number
}

export function verifyTotp(
  token: string,
  secret: string,
  options: VerifyTotpOptions = {},
): boolean {
  if (!/^\d{6}$/.test(token)) return false

  const key = base32Decode(secret)
  if (key === null) return false

  const now = options.now ?? Math.floor(Date.now() / 1000)
  const windowSteps = options.windowSteps ?? 1
  const currentStep = BigInt(Math.floor(now / PERIOD_SECONDS))

  // Every candidate in the window is checked — never short-circuited on the
  // first comparison — and each comparison is constant-time, so accepting on
  // the third of three steps takes the same time as rejecting on the first.
  let matched = false
  for (let offset = -windowSteps; offset <= windowSteps; offset += 1) {
    const candidate = hotp(key, currentStep + BigInt(offset))
    if (constantTimeEquals(candidate, token)) matched = true
  }
  return matched
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  if (bufferA.length !== bufferB.length) return false
  return timingSafeEqual(bufferA, bufferB)
}

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

function base32Decode(text: string): Buffer | null {
  const normalised = text.toUpperCase().replace(/=+$/u, '')
  if (normalised.length === 0 || !/^[A-Z2-7]+$/u.test(normalised)) return null

  const bytes: number[] = []
  let bits = 0
  let value = 0

  for (const char of normalised) {
    const index = BASE32_ALPHABET.indexOf(char)
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

export function assertTotpSecretFormat(secret: string): void {
  if (base32Decode(secret) === null) {
    throw new CogentaError({
      code: 'AUTH_TOTP_INVALID',
      message: 'A TOTP secret must be base32 text.',
      hint: 'Generate one with generateTotpSecret() rather than constructing it by hand.',
    })
  }
}
