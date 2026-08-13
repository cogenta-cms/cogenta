import { CogentaError } from '@cogenta/core'
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type { WebAuthnCredentialData } from './credentials.js'

/**
 * WebAuthn is a dependency and TOTP is not, for the same reason the GraphQL
 * executor is a dependency and the render cache is not: attestation
 * verification — COSE key parsing, signature checks per algorithm, origin and
 * RP ID validation — is a large, security-relevant surface every authenticator
 * and browser expects to behave exactly like the spec, and a homegrown subset
 * is a liability wearing the shape of a feature. `@simplewebauthn/server` is
 * MIT, pure JS (no native code, rule R10 is clean), and is what the ecosystem
 * has converged on.
 *
 * The ceremony is two requests apart — options generated, then a response
 * verified — and needs a challenge to survive the gap. Storage for that
 * challenge is deliberately not this module's job: it is single-use and lives
 * seconds, which is a session or an in-memory cache at the API layer, not a
 * database table alongside credentials that live for years.
 */

export interface WebAuthnConfig {
  readonly relyingPartyName: string
  /** The domain, no scheme and no port — `example.com`, not `https://example.com`. */
  readonly relyingPartyId: string
  readonly origin: string
}

export interface RegistrationOptions {
  readonly options: PublicKeyCredentialCreationOptionsJSON
  readonly challenge: string
}

export async function beginWebAuthnRegistration(
  config: WebAuthnConfig,
  userId: string,
  userName: string,
  existing: readonly WebAuthnCredentialData[],
): Promise<RegistrationOptions> {
  const options = await generateRegistrationOptions({
    rpName: config.relyingPartyName,
    rpID: config.relyingPartyId,
    userID: new TextEncoder().encode(userId),
    userName,
    attestationType: 'none', // A site does not need to know *which* authenticator, only that one exists.
    excludeCredentials: existing.map((credential) => ({
      id: credential.credentialId,
      transports: credential.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  })

  return { options, challenge: options.challenge }
}

export async function completeWebAuthnRegistration(
  config: WebAuthnConfig,
  response: RegistrationResponseJSON,
  expectedChallenge: string,
  label: string | undefined,
): Promise<WebAuthnCredentialData> {
  // A malformed or forged response does not always fail through `verified:
  // false` — the library also throws on input it cannot even parse (wrong
  // shape, bad CBOR). Both paths mean the same thing to a caller: this
  // registration did not succeed, as a typed error rather than a raw one.
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: config.origin,
    expectedRPID: config.relyingPartyId,
  }).catch(() => null)

  if (result === null || !result.verified) {
    throw new CogentaError({
      code: 'AUTH_WEBAUTHN_FAILED',
      message: 'The authenticator response could not be verified.',
      hint: 'Try registering the passkey again. If this keeps happening, the device clock or the site origin configuration may be wrong.',
    })
  }

  const { credential } = result.registrationInfo
  return {
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports ?? [],
    label,
  }
}

export interface AuthenticationOptions {
  readonly options: PublicKeyCredentialRequestOptionsJSON
  readonly challenge: string
}

export async function beginWebAuthnAuthentication(
  config: WebAuthnConfig,
  allowed: readonly WebAuthnCredentialData[],
): Promise<AuthenticationOptions> {
  const options = await generateAuthenticationOptions({
    rpID: config.relyingPartyId,
    userVerification: 'preferred',
    allowCredentials: allowed.map((credential) => ({
      id: credential.credentialId,
      transports: credential.transports as AuthenticatorTransportFuture[],
    })),
  })

  return { options, challenge: options.challenge }
}

export interface WebAuthnAuthenticationResult {
  readonly newCounter: number
}

export async function completeWebAuthnAuthentication(
  config: WebAuthnConfig,
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  credential: WebAuthnCredentialData,
): Promise<WebAuthnAuthenticationResult> {
  // A counter that has not advanced since the last successful use is what a
  // cloned authenticator looks like: refusing it is what makes cloning
  // pointless rather than merely detectable after the fact.
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: config.origin,
    expectedRPID: config.relyingPartyId,
    credential: {
      id: credential.credentialId,
      publicKey: new Uint8Array(Buffer.from(credential.publicKey, 'base64url')),
      counter: credential.counter,
      transports: credential.transports as AuthenticatorTransportFuture[],
    },
  }).catch(() => null)

  if (result === null || !result.verified) {
    throw new CogentaError({
      code: 'AUTH_WEBAUTHN_FAILED',
      message: 'The passkey response could not be verified.',
      hint: 'Try again. If the passkey was moved to a new device or cloned, it will be refused on purpose — register a new one.',
    })
  }

  return { newCounter: result.authenticationInfo.newCounter }
}
