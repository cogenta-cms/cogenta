import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { CogentaError } from '@cogenta/core'

interface ScryptParams {
  readonly N: number
  readonly r: number
  readonly p: number
}

// `util.promisify` cannot see the options-object overload of `scrypt`, only
// the no-options one — this wrapper is the three extra lines that buys back
// the tunable cost parameters without losing the async, non-blocking form.
function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  params: ScryptParams,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Node refuses to run scrypt above its default 32MB `maxmem` ceiling, and
    // the OWASP-floor cost below (N=2^15, r=8) needs `128 * N * r` = exactly
    // that many bytes before OpenSSL's own overhead — so the default clips
    // it. Raise the ceiling instead of lowering the cost.
    const maxmem = 128 * params.N * params.r * 2
    scryptCallback(password, salt, keyLength, { ...params, maxmem }, (error, derived) => {
      if (error) reject(error)
      else resolve(derived)
    })
  })
}

/**
 * scrypt from `node:crypto`, not a dependency.
 *
 * bcrypt and argon2 are both native modules — R10 forbids that without a WASM
 * fallback, and neither ships one. scrypt is memory-hard, tunable, and has
 * been in Node's standard library since 10.5, so there is nothing to add.
 */
const KEY_LENGTH = 64
const SALT_LENGTH = 16
// N=2^15 costs roughly 100ms on ordinary hardware. Doubling it doubles login
// latency for everyone to make one offline attacker's job twice as hard; this
// is the OWASP-recommended floor for scrypt, not a guess.
const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const
const MAX_INPUT_LENGTH = 512

export async function hashPassword(password: string): Promise<string> {
  assertLength(password)
  const salt = randomBytes(SALT_LENGTH)
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, SCRYPT_PARAMS)

  // Parameters travel with the hash, the way bcrypt embeds its cost factor.
  // Raising SCRYPT_PARAMS later must not invalidate every password already
  // stored — it invalidates none, because each hash carries what made it.
  const { N, r, p } = SCRYPT_PARAMS
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

/**
 * Verifies a password against a stored hash.
 *
 * Every failure path — wrong format, wrong length, wrong bytes — takes the
 * same route to `false` in roughly the same time. A verify function whose
 * error path is faster than its comparison path leaks, through timing, which
 * kind of wrong the guess was.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored)
  if (parsed === null) return false
  if (password.length === 0 || password.length > MAX_INPUT_LENGTH) return false

  const derived = await scrypt(password.normalize('NFKC'), parsed.salt, parsed.expected.length, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
  })

  return derived.length === parsed.expected.length && timingSafeEqual(derived, parsed.expected)
}

interface ParsedHash {
  readonly N: number
  readonly r: number
  readonly p: number
  readonly salt: Buffer
  readonly expected: Buffer
}

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null

  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (![N, r, p].every((value) => Number.isInteger(value) && value > 0)) return null

  // An empty salt or hash field parses fine but must not verify: scrypt with
  // a zero-length key returns a zero-length buffer, which trivially equals
  // another zero-length buffer — an empty stored hash would then "match"
  // any password.
  if (parts[4] === '' || parts[5] === '') return null

  try {
    const salt = Buffer.from(parts[4] ?? '', 'base64url')
    const expected = Buffer.from(parts[5] ?? '', 'base64url')
    if (salt.length === 0 || expected.length === 0) return null
    return { N, r, p, salt, expected }
  } catch {
    return null
  }
}

function assertLength(password: string): void {
  if (password.length === 0) {
    throw new CogentaError({
      code: 'AUTH_PASSWORD_INVALID',
      message: 'A password must not be empty.',
      hint: 'Ask for a password with at least a minimum length before hashing it.',
    })
  }
  if (password.length > MAX_INPUT_LENGTH) {
    throw new CogentaError({
      code: 'AUTH_PASSWORD_INVALID',
      message: `A password longer than ${MAX_INPUT_LENGTH} characters is refused before hashing.`,
      hint: 'scrypt has no practical upper bound, but an unbounded input is a denial-of-service knob — a large password costs CPU proportional to its length before it is even compared.',
    })
  }
}
