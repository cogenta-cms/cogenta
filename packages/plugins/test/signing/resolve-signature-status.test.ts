import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CogentaError } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveSignatureStatus } from '../../src/loader.js'
import type { PluginManifest } from '../../src/manifest.js'
import { generateSigningKeyPair } from '../../src/signing/keys.js'
import { signManifest } from '../../src/signing/sign.js'

const MANIFEST: PluginManifest = Object.freeze({
  name: 'test-plugin',
  version: '1.0.0',
  engine: '^1.0.0',
  capabilities: ['content.read'],
  provides: {},
  runtime: 'server',
  isolated: true,
})

/**
 * Exercises the wired-in enforcement directly against real temp files and
 * real crypto, calling `resolveSignatureStatus` with an explicit `source`
 * — `loadPlugin`'s own reference-shape classification (`local` vs.
 * `registry`) is already covered by `loader.test.ts`; what needs deep
 * coverage here is what happens ONCE a plugin is known to be `registry`
 * -sourced, which does not require a real, installable registry package to
 * prove.
 */
describe('resolveSignatureStatus', () => {
  let dir: string
  let manifestPath: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cogenta-plugin-signing-'))
    manifestPath = join(dir, 'plugin.manifest.mjs')
    await writeFile(manifestPath, '// real manifest file is not read here\n', 'utf8')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('local source is dev mode, no signature required, none checked', async () => {
    const result = await resolveSignatureStatus('local', MANIFEST, manifestPath, [])
    expect(result).toEqual({ devMode: true, signatureVerified: false })
  })

  it('registry source with a real, trusted signature verifies', async () => {
    const { publicKey, privateKey } = generateSigningKeyPair()
    const signature = signManifest(MANIFEST, privateKey)
    await writeFile(`${manifestPath}.sig`, signature, 'utf8')

    const result = await resolveSignatureStatus('registry', MANIFEST, manifestPath, [publicKey])
    expect(result).toEqual({ devMode: false, signatureVerified: true })
  })

  it('registry source with no signature file is refused — PLUGIN_SIGNATURE_MISSING', async () => {
    const { publicKey } = generateSigningKeyPair()
    await expect(
      resolveSignatureStatus('registry', MANIFEST, manifestPath, [publicKey]),
    ).rejects.toMatchObject({ code: 'PLUGIN_SIGNATURE_MISSING' })
  })

  it('registry source with a signature from an untrusted key is refused — PLUGIN_SIGNATURE_INVALID', async () => {
    const untrusted = generateSigningKeyPair()
    const trusted = generateSigningKeyPair()
    const signature = signManifest(MANIFEST, untrusted.privateKey)
    await writeFile(`${manifestPath}.sig`, signature, 'utf8')

    await expect(
      resolveSignatureStatus('registry', MANIFEST, manifestPath, [trusted.publicKey]),
    ).rejects.toMatchObject({ code: 'PLUGIN_SIGNATURE_INVALID' })
  })

  it('registry source with a tampered manifest is refused — PLUGIN_SIGNATURE_INVALID', async () => {
    const { publicKey, privateKey } = generateSigningKeyPair()
    const signature = signManifest(MANIFEST, privateKey)
    await writeFile(`${manifestPath}.sig`, signature, 'utf8')
    const tampered: PluginManifest = { ...MANIFEST, capabilities: ['content.publish'] }

    await expect(
      resolveSignatureStatus('registry', tampered, manifestPath, [publicKey]),
    ).rejects.toMatchObject({ code: 'PLUGIN_SIGNATURE_INVALID' })
  })

  it('registry source with the honest empty default trusted-key list refuses every signature', async () => {
    const { privateKey } = generateSigningKeyPair()
    const signature = signManifest(MANIFEST, privateKey)
    await writeFile(`${manifestPath}.sig`, signature, 'utf8')

    await expect(
      resolveSignatureStatus('registry', MANIFEST, manifestPath, []),
    ).rejects.toMatchObject({ code: 'PLUGIN_SIGNATURE_INVALID' })
  })

  it('every refusal is a real CogentaError, never a bare Error', async () => {
    try {
      await resolveSignatureStatus('registry', MANIFEST, manifestPath, [])
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(CogentaError)
    }
  })
})
