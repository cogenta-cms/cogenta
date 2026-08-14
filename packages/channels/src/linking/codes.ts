import { createHash, randomBytes } from 'node:crypto'

/**
 * Crockford-style alphabet, ambiguous characters (`0`/`O`, `1`/`I`/`L`)
 * removed — a code a person reads on a screen and types into a chat app
 * must not depend on font rendering to tell `0` from `O`. 32 symbols divides
 * 256 evenly, so mapping a random byte to an index via modulo carries no
 * bias (unlike an alphabet size that doesn't divide 256).
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/**
 * 8 symbols x 5 bits = 40 bits of entropy. Single-use and short-TTL (minutes,
 * not hours), so this is judged against "can an attacker brute-force one
 * code before it expires", not against long-term-secret standards (that's
 * what session tokens, 256 bits, are for — see `@cogenta/auth`'s
 * `TOKEN_BYTES`). Even at an implausible 100 guesses/second, 2^40 / 100 is
 * over 100 days — a code generated in the admin and typed into a channel
 * within a 10-minute window is not brute-forceable in that window.
 */
const CODE_LENGTH = 8

export function generateLinkCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    const byte = bytes[i] ?? 0
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length]
  }
  return code
}

/** Stored hashed, exactly like a session token (`@cogenta/auth/sessions.ts`) — a leaked table hands out nothing usable. */
export function hashLinkCode(code: string): string {
  return createHash('sha256').update(normalizeCode(code)).digest('base64url')
}

/** Case-insensitive, whitespace-tolerant — a code typed by hand into a chat app should not fail on a stray space or lowercase letter. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}
