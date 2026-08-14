import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * "Sur un canal sans boutons (email, webhook), l'action est un lien signé à
 * usage unique." Same construction as `StorageDriver`'s `signedUrl`
 * (`packages/core/src/storage/local.ts`, `signLocalUrl`/`verifyLocalSignedUrl`)
 * — HMAC-SHA256 over the payload plus an expiry, constant-time comparison on
 * verify. No route exists yet to receive a click on this link (no adapter
 * without `capabilities.buttons` is built yet — email/webhook are later lot
 * tasks); this is the primitive a future adapter constructs a URL from and
 * a future verification endpoint calls to check it, tested in isolation.
 */
export function signApprovalLink(
  signingKey: string,
  token: string,
  decision: 'approved' | 'rejected',
  expiresAtSeconds: number,
): string {
  return createHmac('sha256', signingKey)
    .update(`${token}:${decision}:${expiresAtSeconds}`)
    .digest('hex')
}

export function verifyApprovalLinkSignature(
  signingKey: string,
  token: string,
  decision: 'approved' | 'rejected',
  expiresAtSeconds: number,
  signature: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!Number.isFinite(expiresAtSeconds) || expiresAtSeconds <= nowSeconds) return false

  const expected = Buffer.from(
    signApprovalLink(signingKey, token, decision, expiresAtSeconds),
    'utf8',
  )
  const received = Buffer.from(signature, 'utf8')
  if (expected.length !== received.length) return false
  return timingSafeEqual(expected, received)
}

/**
 * Builds the full signed URL a buttonless channel would send — `baseUrl`
 * points at whatever future route verifies it (not built here; no adapter
 * consumes this yet).
 */
export function buildSignedApprovalLink(
  baseUrl: string,
  signingKey: string,
  token: string,
  decision: 'approved' | 'rejected',
  expiresInSeconds: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const expiresAtSeconds = nowSeconds + expiresInSeconds
  const signature = signApprovalLink(signingKey, token, decision, expiresAtSeconds)
  const params = new URLSearchParams({
    token,
    decision,
    expires: String(expiresAtSeconds),
    signature,
  })
  return `${baseUrl}?${params.toString()}`
}
