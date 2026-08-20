import { createHash } from 'node:crypto'

/**
 * `sha256(secret | ip)`, hex-encoded — never the address itself (RGPD,
 * ADR-0025). Same construction as `@cogenta/analytics`'s `sessionHash`: a
 * secret makes the hash useless for an offline dictionary attack against the
 * (small) IPv4 address space without it, and the hash is still stable for the
 * lifetime of that secret, which is what lets `countApprovedByIp` recognise a
 * returning commenter and `rate-limit.ts` bucket by IP.
 *
 * `secret` is deliberately a plain parameter rather than something this
 * module reads from the environment itself — the caller (the CLI, wiring
 * `cogenta serve`) is the one place a secret is allowed to be read (R7).
 */
export function hashIp(secret: string, ip: string): string {
  return createHash('sha256').update(`${secret}|${ip}`, 'utf8').digest('hex')
}
