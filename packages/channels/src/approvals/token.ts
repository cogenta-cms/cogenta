import { createHash, randomBytes } from 'node:crypto'

/**
 * Same alphabet as the linking code (`linking/codes.ts`) — Crockford-style,
 * ambiguous characters removed, 32 symbols divides 256 evenly so a
 * byte-to-index mapping via modulo carries no bias. Kept as its own copy
 * rather than imported: this is only the second real usage of this exact
 * alphabet in this package (the linking code is the first), one short of
 * this codebase's "not before three usages" threshold for extracting a
 * shared helper — and the two tokens have deliberately different lengths
 * and TTLs, so a shared constant would need parameterising anyway.
 */
const TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/**
 * 12 symbols x 5 bits = 60 bits of entropy — longer than the 8-symbol (40
 * bit) linking code, because an approval token authorises a real,
 * consequential action (publishing content, patching a dependency, ...)
 * rather than just proving "I received this code", and it lives for longer
 * (`APPROVAL_TOKEN_TTL_MS`) than the linking code's short window, so it
 * needs a wider brute-force margin.
 */
const TOKEN_LENGTH = 12

/** 20 minutes: long enough that a human notified on a phone has time to read a diff summary and decide, short enough that a stale approval request cannot be actioned days later against a world that has since moved on. */
export const APPROVAL_TOKEN_TTL_MS = 20 * 60 * 1000

export function generateApprovalToken(): string {
  const bytes = randomBytes(TOKEN_LENGTH)
  let token = ''
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    const byte = bytes[i] ?? 0
    token += TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length]
  }
  return token
}

/** Stored hashed, exactly like the linking code and a session token — a leaked table hands out nothing usable. */
export function hashApprovalToken(token: string): string {
  return createHash('sha256').update(normalizeApprovalToken(token)).digest('base64url')
}

export function normalizeApprovalToken(token: string): string {
  return token.trim().toUpperCase()
}
