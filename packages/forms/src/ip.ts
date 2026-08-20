import { createHash } from 'node:crypto'

/**
 * `sha256(ip)`, hex-encoded — never the address itself (fiche 16 acceptance
 * criterion: "Aucune adresse IP en clair"). Unlike `@cogenta/analytics`'s
 * daily-salted hash (built for cross-day-unlinkable visitor counting), a
 * submission's IP hash has a different job: letting an operator spot "the
 * same source hammering this form" *within* the anti-abuse window, and the
 * rate limiter's own key needs a stable value across the window to work at
 * all. A per-day salt would defeat that. It is still one-way, and still never
 * the address in the clear.
 */
export function hashIp(ip: string): string {
  return createHash('sha256').update(ip, 'utf8').digest('hex')
}
