import { describe, expect, it } from 'vitest'
import type { PluginManifest } from '../../src/manifest.js'
import { createPluginRegistry } from '../../src/registries/plugins.js'
import { generateSigningKeyPair } from '../../src/signing/keys.js'
import { signContent } from '../../src/signing/sign.js'
import { testDb } from '../helpers/db.js'

const VALID_MANIFEST: PluginManifest = Object.freeze({
  name: 'test-plugin',
  version: '1.0.0',
  engine: '^1.0.0',
  capabilities: ['content.read'],
  provides: {},
  runtime: 'server',
  isolated: true,
})

const INVALID_MANIFEST = Object.freeze({
  name: 'test-plugin',
  version: '1.0.0',
  engine: '^1.0.0',
  // http.fetch with no domain — one of definePlugin's own hard refusals.
  capabilities: ['http.fetch'],
  provides: {},
  runtime: 'server',
  isolated: true,
})

describe('createPluginRegistry', () => {
  it('accepts a signed, valid submission into the pending state, never auto-accepted', async () => {
    const db = await testDb()
    const { publicKey, privateKey } = generateSigningKeyPair()
    const registry = createPluginRegistry(
      db,
      { trustedPublicKeys: [publicKey] },
      () => 1_700_000_000_000,
    )

    const signature = signContent(VALID_MANIFEST, privateKey)
    const entry = await registry.submit({
      submitterId: 'user-1',
      displayName: 'Test Plugin',
      manifest: VALID_MANIFEST,
      signatureBase64: signature,
    })

    expect(entry.status).toBe('pending')
    expect(entry.pluginName).toBe('test-plugin')
    expect(entry.pluginVersion).toBe('1.0.0')
    expect(entry.rejectionCode).toBeNull()
    expect(entry.reviewedBy).toBeNull()
  })

  it('rejects a submission with a missing signature immediately, never reaching pending', async () => {
    const db = await testDb()
    const { publicKey } = generateSigningKeyPair()
    const registry = createPluginRegistry(
      db,
      { trustedPublicKeys: [publicKey] },
      () => 1_700_000_000_000,
    )

    const entry = await registry.submit({
      submitterId: 'user-1',
      displayName: 'Test Plugin',
      manifest: VALID_MANIFEST,
      signatureBase64: null,
    })

    expect(entry.status).toBe('rejected')
    expect(entry.rejectionCode).toBe('PLUGIN_SIGNATURE_MISSING')
    expect(entry.pluginName).toBeNull()

    expect(await registry.listAccepted()).toHaveLength(0)
  })

  it('rejects a submission with an invalid (untrusted-key) signature, even with a perfectly valid manifest', async () => {
    const db = await testDb()
    const { publicKey: trustedKey } = generateSigningKeyPair()
    const { privateKey: attackerKey } = generateSigningKeyPair()
    const registry = createPluginRegistry(
      db,
      { trustedPublicKeys: [trustedKey] },
      () => 1_700_000_000_000,
    )

    const signature = signContent(VALID_MANIFEST, attackerKey)
    const entry = await registry.submit({
      submitterId: 'user-1',
      displayName: 'Test Plugin',
      manifest: VALID_MANIFEST,
      signatureBase64: signature,
    })

    expect(entry.status).toBe('rejected')
    expect(entry.rejectionCode).toBe('PLUGIN_SIGNATURE_INVALID')
    expect(entry.pluginName).toBeNull()
  })

  it('rejects a validly-signed but structurally invalid manifest with the real definePlugin error, never reaching pending', async () => {
    const db = await testDb()
    const { publicKey, privateKey } = generateSigningKeyPair()
    const registry = createPluginRegistry(
      db,
      { trustedPublicKeys: [publicKey] },
      () => 1_700_000_000_000,
    )

    const signature = signContent(INVALID_MANIFEST, privateKey)
    const entry = await registry.submit({
      submitterId: 'user-1',
      displayName: 'Test Plugin',
      manifest: INVALID_MANIFEST,
      signatureBase64: signature,
    })

    expect(entry.status).toBe('rejected')
    expect(entry.rejectionCode).toBe('PLUGIN_MANIFEST_INVALID')
    expect(entry.rejectionReason).toContain('http.fetch')
    expect(entry.pluginName).toBeNull()
  })

  it('moves a pending submission to accepted on a human accept decision, and it appears in listAccepted', async () => {
    const db = await testDb()
    const { publicKey, privateKey } = generateSigningKeyPair()
    const registry = createPluginRegistry(
      db,
      { trustedPublicKeys: [publicKey] },
      () => 1_700_000_000_000,
    )

    const submitted = await registry.submit({
      submitterId: 'user-1',
      displayName: 'Test Plugin',
      manifest: VALID_MANIFEST,
      signatureBase64: signContent(VALID_MANIFEST, privateKey),
    })

    const result = await registry.review(submitted.id, 'accept', 'reviewer-1')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok result')
    expect(result.entry.status).toBe('accepted')

    const accepted = await registry.listAccepted()
    expect(accepted.map((p) => p.id)).toEqual([submitted.id])
  })

  it('moves a pending submission to rejected on a human reject decision, and it never appears in listAccepted', async () => {
    const db = await testDb()
    const { publicKey, privateKey } = generateSigningKeyPair()
    const registry = createPluginRegistry(
      db,
      { trustedPublicKeys: [publicKey] },
      () => 1_700_000_000_000,
    )

    const submitted = await registry.submit({
      submitterId: 'user-1',
      displayName: 'Test Plugin',
      manifest: VALID_MANIFEST,
      signatureBase64: signContent(VALID_MANIFEST, privateKey),
    })

    const result = await registry.review(
      submitted.id,
      'reject',
      'reviewer-1',
      'Failed manual review.',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok result')
    expect(result.entry.status).toBe('rejected')
    expect(result.entry.rejectionReason).toBe('Failed manual review.')

    expect(await registry.listAccepted()).toHaveLength(0)
  })

  it('refuses to re-review an already-decided submission, returning the prior decision rather than a raw error', async () => {
    const db = await testDb()
    const { publicKey, privateKey } = generateSigningKeyPair()
    const registry = createPluginRegistry(
      db,
      { trustedPublicKeys: [publicKey] },
      () => 1_700_000_000_000,
    )

    const submitted = await registry.submit({
      submitterId: 'user-1',
      displayName: 'Test Plugin',
      manifest: VALID_MANIFEST,
      signatureBase64: signContent(VALID_MANIFEST, privateKey),
    })
    await registry.review(submitted.id, 'accept', 'reviewer-1')

    const second = await registry.review(submitted.id, 'reject', 'reviewer-2')
    expect(second.ok).toBe(false)
    if (second.ok) throw new Error('expected not-ok result')
    expect(second.reason).toBe('already_decided')
    if (second.reason === 'already_decided') {
      expect(second.entry.status).toBe('accepted')
    }
  })

  it('an auto-rejected submission (bad signature) cannot be reviewed since it never reaches pending', async () => {
    const db = await testDb()
    const { publicKey } = generateSigningKeyPair()
    const registry = createPluginRegistry(
      db,
      { trustedPublicKeys: [publicKey] },
      () => 1_700_000_000_000,
    )

    const submitted = await registry.submit({
      submitterId: 'user-1',
      displayName: 'Test Plugin',
      manifest: VALID_MANIFEST,
      signatureBase64: null,
    })

    const result = await registry.review(submitted.id, 'accept', 'reviewer-1')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected not-ok result')
    expect(result.reason).toBe('already_decided')
  })

  it('reports not_found for a review of an unknown submission id', async () => {
    const db = await testDb()
    const registry = createPluginRegistry(db, {}, () => 1_700_000_000_000)

    const result = await registry.review('does-not-exist', 'accept', 'reviewer-1')
    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })

  it('get() returns the real stored entry by id, or null for an unknown id', async () => {
    const db = await testDb()
    const { publicKey, privateKey } = generateSigningKeyPair()
    const registry = createPluginRegistry(
      db,
      { trustedPublicKeys: [publicKey] },
      () => 1_700_000_000_000,
    )

    const submitted = await registry.submit({
      submitterId: 'user-1',
      displayName: 'Test Plugin',
      description: 'A demo plugin.',
      manifest: VALID_MANIFEST,
      signatureBase64: signContent(VALID_MANIFEST, privateKey),
    })

    const fetched = await registry.get(submitted.id)
    expect(fetched?.id).toBe(submitted.id)
    expect(fetched?.description).toBe('A demo plugin.')

    expect(await registry.get('missing')).toBeNull()
  })
})
