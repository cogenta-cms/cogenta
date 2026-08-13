import { describe, expect, it } from 'vitest'
import {
  beginWebAuthnAuthentication,
  beginWebAuthnRegistration,
  completeWebAuthnAuthentication,
  completeWebAuthnRegistration,
  type WebAuthnConfig,
} from '../src/webauthn.js'

/**
 * What this file does NOT cover: a full successful registration or
 * authentication ceremony. That requires a real (or fully simulated)
 * authenticator producing a valid attestation/assertion signature over a
 * server-issued challenge — `@simplewebauthn/server`'s own test suite covers
 * that cryptography, and faking it here would mean re-deriving COSE keys and
 * signatures by hand, which is exactly the ceremony this package chose a
 * dependency over hand-writing (see the comment at the top of src/webauthn.ts).
 * What's covered instead: option generation shape, and that a garbage/forged
 * response is rejected rather than silently accepted.
 */

const CONFIG: WebAuthnConfig = {
  relyingPartyName: 'Cogenta',
  relyingPartyId: 'example.com',
  origin: 'https://example.com',
}

describe('beginWebAuthnRegistration', () => {
  it('produces registration options carrying the user id and RP', async () => {
    const result = await beginWebAuthnRegistration(CONFIG, 'user-1', 'alice@example.com', [])

    expect(result.options.rp.id).toBe('example.com')
    expect(result.options.rp.name).toBe('Cogenta')
    expect(result.options.user.name).toBe('alice@example.com')
    expect(result.options.attestation).toBe('none')
    expect(result.challenge).toBe(result.options.challenge)
    expect(result.challenge.length).toBeGreaterThan(0)
  })

  it('excludes credentials the user already registered, so re-registering the same key fails fast', async () => {
    const existing = [
      {
        credentialId: 'existing-cred',
        publicKey: 'irrelevant',
        counter: 0,
        transports: ['internal'],
        label: undefined,
      },
    ]
    const result = await beginWebAuthnRegistration(CONFIG, 'user-1', 'alice@example.com', existing)

    expect(result.options.excludeCredentials?.map((c) => c.id)).toEqual(['existing-cred'])
  })

  it('issues a fresh challenge on every call', async () => {
    const a = await beginWebAuthnRegistration(CONFIG, 'user-1', 'alice@example.com', [])
    const b = await beginWebAuthnRegistration(CONFIG, 'user-1', 'alice@example.com', [])
    expect(a.challenge).not.toBe(b.challenge)
  })
})

describe('completeWebAuthnRegistration', () => {
  it('rejects a forged response rather than throwing an unhandled error', async () => {
    const { challenge } = await beginWebAuthnRegistration(CONFIG, 'user-1', 'alice@example.com', [])

    await expect(
      completeWebAuthnRegistration(
        CONFIG,
        {
          id: 'forged',
          rawId: 'forged',
          type: 'public-key',
          clientExtensionResults: {},
          response: {
            clientDataJSON: Buffer.from('{}').toString('base64url'),
            attestationObject: Buffer.from('not-real-cbor').toString('base64url'),
          },
        } as never,
        challenge,
        'My device',
      ),
    ).rejects.toMatchObject({ code: 'AUTH_WEBAUTHN_FAILED' })
  })
})

describe('beginWebAuthnAuthentication', () => {
  it('lists the allowed credential ids for the user', async () => {
    const allowed = [
      {
        credentialId: 'cred-1',
        publicKey: 'irrelevant',
        counter: 0,
        transports: ['internal'],
        label: undefined,
      },
    ]
    const result = await beginWebAuthnAuthentication(CONFIG, allowed)
    expect(result.options.allowCredentials?.map((c) => c.id)).toEqual(['cred-1'])
    expect(result.challenge).toBe(result.options.challenge)
  })

  it('issues a fresh challenge on every call', async () => {
    const a = await beginWebAuthnAuthentication(CONFIG, [])
    const b = await beginWebAuthnAuthentication(CONFIG, [])
    expect(a.challenge).not.toBe(b.challenge)
  })
})

describe('completeWebAuthnAuthentication', () => {
  it('rejects a forged assertion rather than throwing an unhandled error', async () => {
    const { challenge } = await beginWebAuthnAuthentication(CONFIG, [])
    const credential = {
      credentialId: 'cred-1',
      publicKey: Buffer.from('not-a-real-cose-key').toString('base64url'),
      counter: 0,
      transports: ['internal'],
      label: undefined,
    }

    await expect(
      completeWebAuthnAuthentication(
        CONFIG,
        {
          id: 'cred-1',
          rawId: 'cred-1',
          type: 'public-key',
          clientExtensionResults: {},
          response: {
            clientDataJSON: Buffer.from('{}').toString('base64url'),
            authenticatorData: Buffer.from('not-real').toString('base64url'),
            signature: Buffer.from('not-real').toString('base64url'),
          },
        } as never,
        challenge,
        credential,
      ),
    ).rejects.toMatchObject({ code: 'AUTH_WEBAUTHN_FAILED' })
  })
})
