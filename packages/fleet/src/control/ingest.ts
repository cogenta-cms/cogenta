import { CogentaError } from '@cogenta/core'
import { assertNoForbiddenFields } from '../agent/assert.js'
import type { SignedTelemetry } from '../agent/sign.js'
import { verifyTelemetrySignature } from '../agent/sign.js'
import type { EnrollmentStore, SiteRegistration } from '../enrollment/store.js'
import type { SiteStateStore, TelemetrySnapshot } from './state.js'

/**
 * "Le plan de contrôle est un observateur... pas un propriétaire" only holds
 * if it never trusts a sender's own claims — a discriminated result, not a
 * raw exception, matching every other "here's exactly why this was refused"
 * shape this session's L6/L7 forks established (`@cogenta/channels`' link
 * codes, `@cogenta/plugins`' registries).
 */
export type IngestResult =
  | { readonly ok: true; readonly snapshot: TelemetrySnapshot }
  | {
      readonly ok: false
      readonly reason: 'unknown_site' | 'revoked' | 'invalid_signature' | 'forbidden_field'
      readonly message: string
    }

/**
 * The control plane's real ingestion boundary — the receiving-side half of
 * "## Ce qui remonte, et ce qui ne remonte pas"'s "critère d'acceptation
 * testé, pas une intention." Three independent checks, in this order:
 *
 * 1. **The claimed site is actually paired, and not revoked** — cheap, no
 *    cryptography needed, and refusing here first means an unpaired or
 *    revoked sender never gets far enough to learn whether its signature
 *    would otherwise have been accepted. Revocation is checked as its own
 *    condition, never folded into "does the signature verify": a site
 *    paired before being revoked still holds a cryptographically valid
 *    keypair, so signature validity alone can never be what keeps a revoked
 *    site out.
 * 2. **The signature genuinely verifies against THAT site's registered
 *    public key** (`../enrollment/store.js`, task 1) — a payload signed
 *    with any other key, or tampered with after signing, is rejected here.
 * 3. **The payload, independently re-inspected on receipt, still contains
 *    only the real, closed shape** (`assertNoForbiddenFields`, task 2's own
 *    defense-in-depth check, re-run here rather than trusted from the
 *    sender) — a compromised or buggy site is exactly the threat model this
 *    step defends against; trusting that a sender's own type system kept it
 *    honest is not a real security boundary.
 *
 * A rejection at any step never touches `stateStore` — a partially-applied,
 * unverified update is worse than none.
 */
export async function ingestTelemetry(
  signed: SignedTelemetry,
  enrollmentStore: EnrollmentStore,
  stateStore: SiteStateStore,
): Promise<IngestResult> {
  const siteId = signed.payload.siteId
  const site: SiteRegistration | null = await enrollmentStore.getSite(siteId)

  if (site === null) {
    return { ok: false, reason: 'unknown_site', message: `No paired site "${siteId}".` }
  }
  if (site.revoked) {
    return { ok: false, reason: 'revoked', message: `Site "${siteId}" is revoked.` }
  }

  if (!verifyTelemetrySignature(signed, site.publicKey)) {
    return {
      ok: false,
      reason: 'invalid_signature',
      message: `Telemetry signature for site "${siteId}" does not verify against its registered key.`,
    }
  }

  try {
    assertNoForbiddenFields(signed.payload)
  } catch (error) {
    const message =
      error instanceof CogentaError ? error.message : 'Telemetry payload failed the shape check.'
    return { ok: false, reason: 'forbidden_field', message }
  }

  const snapshot = await stateStore.recordSnapshot(siteId, signed.payload)
  return { ok: true, snapshot }
}
