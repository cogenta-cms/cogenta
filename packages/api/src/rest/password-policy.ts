import { CogentaError } from '@cogenta/core'

/**
 * Shared between `users-router.ts` (self-service password change) and
 * `auth-router.ts` (`POST /api/auth/reset-password`) — a password chosen
 * through either door has to clear the same floor, or "reset your password"
 * would let someone set something the change-password screen would refuse.
 *
 * Long enough that scrypt is the attacker's only option, short of a leak.
 */
export const MIN_PASSWORD_LENGTH = 12

export function assertPasswordPolicy(password: string): void {
  if (password.length >= MIN_PASSWORD_LENGTH) return
  throw new CogentaError({
    code: 'AUTH_PASSWORD_INVALID',
    message: `A password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    hint: 'A passphrase of a few ordinary words is both longer and easier to remember than a short one with symbols in it.',
  })
}
