import { createHash, randomBytes } from 'node:crypto'

/**
 * 32 random bytes (256 bits), base64url — the same shape as
 * `@cogenta/auth`'s session tokens (`sessions.ts`'s `TOKEN_BYTES`), not the
 * shorter 8-character human-typed code `@cogenta/channels`' linking flow
 * uses (L6 task 2). A pairing token is copy-pasted into a site's own
 * configuration during enrollment, never hand-typed character by character
 * into a chat app — there's no reason to shrink its alphabet for
 * readability, and every bit of entropy here defends a real, if short-lived,
 * bearer credential: whoever presents it gets to register a site.
 */
const TOKEN_BYTES = 32

export function generatePairingToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

/** Stored hashed, exactly like a session token — a leaked table hands out nothing usable. */
export function hashPairingToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}
