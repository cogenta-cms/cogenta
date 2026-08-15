import { signContent, verifyContentSignature } from '@cogenta/plugins'
import { assertNoForbiddenFields } from './assert.js'
import type { TelemetryPayload } from './types.js'

export interface SignedTelemetry {
  readonly payload: TelemetryPayload
  /** Base64 Ed25519 signature over the payload's canonical content — `@cogenta/plugins`' generalized signing primitive (task 9/12), the same one this project's control-plane pairing already uses (L8 task 1). */
  readonly signatureBase64: string
}

/**
 * Signs a telemetry payload with the site's own paired private key
 * (`@cogenta/fleet`'s enrollment, task 1) before it ever leaves the
 * process. Runs the real, defense-in-depth forbidden-field check first —
 * signing a payload does not make an accidentally-forbidden field safe to
 * send, so this refuses to sign one at all rather than signing something
 * that then has to be caught later, closer to the network boundary.
 */
export function signTelemetryPayload(
  payload: TelemetryPayload,
  sitePrivateKeyBase64: string,
): SignedTelemetry {
  assertNoForbiddenFields(payload)
  return { payload, signatureBase64: signContent(payload, sitePrivateKeyBase64) }
}

/** Verifies a signed telemetry payload against the site's registered public key — the control plane's real half of this primitive (ingestion is task 3's job, not this one's). */
export function verifyTelemetrySignature(
  signed: SignedTelemetry,
  sitePublicKeyBase64: string,
): boolean {
  return verifyContentSignature(signed.payload, signed.signatureBase64, sitePublicKeyBase64)
}
