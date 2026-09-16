import { describe, expect, it } from 'vitest'
import { pluginCodeDigest } from '../../src/entry.js'
import type { PluginManifest } from '../../src/manifest.js'
import { generateSigningKeyPair } from '../../src/signing/keys.js'
import { canonicalizeManifest, signManifest, signPlugin } from '../../src/signing/sign.js'
import { verifyManifestSignature, verifyPluginSignature } from '../../src/signing/verify.js'

const MANIFEST: PluginManifest = Object.freeze({
  name: 'test-plugin',
  version: '1.0.0',
  engine: '^1.0.0',
  capabilities: ['content.read'],
  provides: {},
  runtime: 'server',
  isolated: true,
})

describe('canonicalizeManifest', () => {
  it('produces the same string regardless of property insertion order', () => {
    const reordered: PluginManifest = {
      isolated: true,
      runtime: 'server',
      provides: {},
      capabilities: ['content.read'],
      engine: '^1.0.0',
      version: '1.0.0',
      name: 'test-plugin',
    }
    expect(canonicalizeManifest(reordered)).toBe(canonicalizeManifest(MANIFEST))
  })

  it('produces a different string for a different manifest', () => {
    const other: PluginManifest = { ...MANIFEST, version: '2.0.0' }
    expect(canonicalizeManifest(other)).not.toBe(canonicalizeManifest(MANIFEST))
  })
})

describe('signManifest / verifyManifestSignature', () => {
  it('a real signature verifies against the matching public key', () => {
    const { publicKey, privateKey } = generateSigningKeyPair()
    const signature = signManifest(MANIFEST, privateKey)
    expect(verifyManifestSignature(MANIFEST, signature, publicKey)).toBe(true)
  })

  it('rejects a signature checked against a different key pair', () => {
    const signer = generateSigningKeyPair()
    const impostor = generateSigningKeyPair()
    const signature = signManifest(MANIFEST, signer.privateKey)
    expect(verifyManifestSignature(MANIFEST, signature, impostor.publicKey)).toBe(false)
  })

  it('rejects a signature checked against tampered manifest content', () => {
    const { publicKey, privateKey } = generateSigningKeyPair()
    const signature = signManifest(MANIFEST, privateKey)
    const tampered: PluginManifest = { ...MANIFEST, capabilities: ['content.publish'] }
    expect(verifyManifestSignature(tampered, signature, publicKey)).toBe(false)
  })

  it('rejects a malformed signature without throwing', () => {
    const { publicKey } = generateSigningKeyPair()
    expect(verifyManifestSignature(MANIFEST, 'not-a-real-signature', publicKey)).toBe(false)
  })

  it('rejects a malformed public key without throwing', () => {
    const { privateKey } = generateSigningKeyPair()
    const signature = signManifest(MANIFEST, privateKey)
    expect(verifyManifestSignature(MANIFEST, signature, 'not-a-real-key')).toBe(false)
  })
})

describe('verifyPluginSignature', () => {
  it('verifies against any one of several trusted keys', () => {
    const other = generateSigningKeyPair()
    const signer = generateSigningKeyPair()
    const signature = signManifest(MANIFEST, signer.privateKey)
    expect(verifyPluginSignature(MANIFEST, signature, [other.publicKey, signer.publicKey])).toBe(
      true,
    )
  })

  it('rejects when the signer is not among the trusted keys', () => {
    const other = generateSigningKeyPair()
    const signer = generateSigningKeyPair()
    const signature = signManifest(MANIFEST, signer.privateKey)
    expect(verifyPluginSignature(MANIFEST, signature, [other.publicKey])).toBe(false)
  })

  it('rejects a null signature (missing signature file) against any trusted key set', () => {
    const { publicKey } = generateSigningKeyPair()
    expect(verifyPluginSignature(MANIFEST, null, [publicKey])).toBe(false)
  })

  it('rejects any signature when no keys are trusted (the honest empty default)', () => {
    const { privateKey } = generateSigningKeyPair()
    const signature = signManifest(MANIFEST, privateKey)
    expect(verifyPluginSignature(MANIFEST, signature, [])).toBe(false)
  })
})

describe('a signature that covers the code (L31 step 1)', () => {
  it('verifies manifest and code together, and breaks when either changes', async () => {
    const { publicKey, privateKey } = await generateSigningKeyPair()
    const code = '({ handle: () => 1 })'
    const signature = signPlugin(MANIFEST, pluginCodeDigest(code), privateKey)

    expect(verifyPluginSignature(MANIFEST, signature, [publicKey], pluginCodeDigest(code))).toBe(
      true,
    )
    // One character of the plugin's own code, and the signature no longer holds.
    expect(
      verifyPluginSignature(
        MANIFEST,
        signature,
        [publicKey],
        pluginCodeDigest('({ handle: () => 2 })'),
      ),
    ).toBe(false)
    // Nor does the manifest alone satisfy it: the code is part of what was signed.
    expect(verifyPluginSignature(MANIFEST, signature, [publicKey])).toBe(false)
  })

  it('keeps verifying a manifest-only signature for a plugin that ships no code', async () => {
    const { publicKey, privateKey } = await generateSigningKeyPair()
    const signature = signManifest(MANIFEST, privateKey)

    expect(verifyPluginSignature(MANIFEST, signature, [publicKey])).toBe(true)
  })
})
