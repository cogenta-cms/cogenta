import { generateSigningKeyPair, type SigningKeyPair } from '@cogenta/plugins'

/**
 * The control plane's own real Ed25519 identity — distinct from any site's.
 * A site signs its outgoing telemetry with ITS key (`../agent/sign.ts`); the
 * control plane signs outgoing commands with ITS OWN key, and a site
 * verifies those against the public half recorded here, learned once at
 * pairing time (`../enrollment/store.ts`'s `PairingToken.controlPlanePublicKey`).
 * Two independent keypairs, two independent verification directions — never
 * the same key checked both ways.
 */
export type ControlPlaneIdentity = SigningKeyPair

export function generateControlPlaneIdentity(): ControlPlaneIdentity {
  return generateSigningKeyPair()
}
