import { randomInt } from 'node:crypto'
import { hashPassword, verifyPassword } from './password.js'

/**
 * TOTP recovery codes (fiche 18 task 1) — the way back in for an account that
 * enrolled a second factor and then lost the device that produces it.
 *
 * Without this, `docs/lots/17-utilisateurs.md`'s deliberate decision not to let
 * an admin reset somebody else's password, combined with a lost authenticator,
 * is a permanent lockout. A recovery code is, in every way that matters, a
 * spare password: ten of them are generated at once, shown to the person
 * exactly once, and stored **hashed with the same scrypt as a real password**
 * (`password.ts`) rather than a lighter or reversible encoding — a leaked
 * credentials table must hand out nothing live here either.
 */

export const RECOVERY_CODE_COUNT = 10

// No 0/O or 1/I: both pairs are read off a screen and typed back by hand, and
// this alphabet is chosen so no code is ambiguous doing that.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const GROUP_LENGTH = 5

function randomGroup(): string {
  let group = ''
  for (let i = 0; i < GROUP_LENGTH; i += 1) {
    group += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }
  return group
}

/** A fresh code, shaped `XXXXX-XXXXX` — 10 characters from a 32-letter alphabet, ~50 bits of entropy. */
function randomCode(): string {
  return `${randomGroup()}-${randomGroup()}`
}

/** `count` fresh, distinct plaintext codes. The caller shows them to the person exactly once and never logs them. */
export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): readonly string[] {
  const codes = new Set<string>()
  while (codes.size < count) codes.add(randomCode())
  return [...codes]
}

/**
 * What a person actually types back rarely matches the display exactly —
 * lowercase, a missing dash, stray whitespace copied along with it. None of
 * that is part of the secret, so it is normalised away before hashing and
 * before verifying, on both sides, the same way.
 */
export function normaliseRecoveryCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, '')
}

export function hashRecoveryCode(code: string): Promise<string> {
  return hashPassword(normaliseRecoveryCode(code))
}

export function verifyRecoveryCode(code: string, hash: string): Promise<boolean> {
  return verifyPassword(normaliseRecoveryCode(code), hash)
}
