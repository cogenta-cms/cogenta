import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VOCABULARY_NAMES } from '@cogenta/blocks'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createThemeRegistry } from '../../src/registries/themes.js'
import { generateSigningKeyPair } from '../../src/signing/keys.js'
import { signContent } from '../../src/signing/sign.js'
import { testDb } from '../helpers/db.js'

/**
 * "Signature, contrat vérifié" (the lot's own words for the Themes registry)
 * — both real, both reused wholesale: task 9's Ed25519 primitive (generalized
 * to arbitrary content) for the signature, and `@cogenta/render`'s real
 * `verifyTheme`/`validateSkin` (contract D's actual install-time check) for
 * the contract. No human review step exists here, same automatic-only shape
 * as the Skins gallery (task 10) — just with more real checks than a bare
 * token set needs.
 */

const VALID_TOKENS = {
  color: {
    bg: '#ffffff',
    fg: '#16181d',
    accent: '#1d4ed8',
    accentFg: '#ffffff',
    muted: '#f2f4f7',
    mutedFg: '#3f4655',
    border: '#d7dbe2',
  },
  font: {
    sans: 'ui-sans-serif, system-ui, sans-serif',
    serif: 'ui-serif, Georgia, serif',
    mono: 'ui-monospace, monospace',
    scale: 1.25,
    baseSize: '1rem',
  },
  space: { unit: '0.25rem', density: 'comfortable' },
  radius: { sm: '0.25rem', md: '0.5rem', lg: '1rem' },
  motion: { duration: '180ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
  shadow: { sm: '0 1px 2px rgba(22, 24, 29, 0.08)', md: '0 6px 24px rgba(22, 24, 29, 0.12)' },
}

function validManifest(name: string): Record<string, unknown> {
  return {
    name,
    version: '1.0.0',
    engine: '^1.0.0',
    blocks: '^1.0.0',
    implements: [...VOCABULARY_NAMES],
    collections: '*',
    runtime: 'static',
    tokens: './tokens.json',
  }
}

describe('createThemeRegistry', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cogenta-theme-registry-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('accepts a theme with a valid signature and a valid contract', async () => {
    const db = await testDb()
    const { publicKey, privateKey } = generateSigningKeyPair()
    const manifest = validManifest('acme-theme')
    await writeFile(join(dir, 'tokens.json'), JSON.stringify(VALID_TOKENS), 'utf8')

    const registry = createThemeRegistry(db, { trustedPublicKeys: [publicKey] })
    const entry = await registry.submit({
      submitterId: 'author-1',
      displayName: 'Acme Theme',
      manifest,
      themeRoot: dir,
      signatureBase64: signContent(manifest, privateKey),
    })

    expect(entry.status).toBe('accepted')
    expect(entry.rejectionCode).toBeNull()
    expect(await registry.listAccepted()).toHaveLength(1)
  })

  it('rejects a missing signature regardless of an otherwise-valid contract', async () => {
    const db = await testDb()
    const { publicKey } = generateSigningKeyPair()
    const manifest = validManifest('unsigned-theme')
    await writeFile(join(dir, 'tokens.json'), JSON.stringify(VALID_TOKENS), 'utf8')

    const registry = createThemeRegistry(db, { trustedPublicKeys: [publicKey] })
    const entry = await registry.submit({
      submitterId: 'author-1',
      displayName: 'Unsigned Theme',
      manifest,
      themeRoot: dir,
      signatureBase64: null,
    })

    expect(entry.status).toBe('rejected')
    expect(entry.rejectionCode).toBe('THEME_SIGNATURE_INVALID')
    expect(await registry.listAccepted()).toHaveLength(0)
  })

  it('rejects a signature from an untrusted key, even over genuinely valid content', async () => {
    const db = await testDb()
    const { publicKey: trustedKey } = generateSigningKeyPair()
    const { privateKey: attackerKey } = generateSigningKeyPair()
    const manifest = validManifest('spoofed-theme')
    await writeFile(join(dir, 'tokens.json'), JSON.stringify(VALID_TOKENS), 'utf8')

    const registry = createThemeRegistry(db, { trustedPublicKeys: [trustedKey] })
    const entry = await registry.submit({
      submitterId: 'author-1',
      displayName: 'Spoofed Theme',
      manifest,
      themeRoot: dir,
      signatureBase64: signContent(manifest, attackerKey),
    })

    expect(entry.status).toBe('rejected')
    expect(entry.rejectionCode).toBe('THEME_SIGNATURE_INVALID')
  })

  it('rejects a validly-signed theme that does not implement the whole block vocabulary', async () => {
    const db = await testDb()
    const { publicKey, privateKey } = generateSigningKeyPair()
    const manifest = { ...validManifest('incomplete-theme'), implements: ['hero', 'prose'] }
    await writeFile(join(dir, 'tokens.json'), JSON.stringify(VALID_TOKENS), 'utf8')

    const registry = createThemeRegistry(db, { trustedPublicKeys: [publicKey] })
    const entry = await registry.submit({
      submitterId: 'author-1',
      displayName: 'Incomplete Theme',
      manifest,
      themeRoot: dir,
      signatureBase64: signContent(manifest, privateKey),
    })

    expect(entry.status).toBe('rejected')
    expect(entry.rejectionCode).toBe('THEME_BLOCK_MISSING')
  })

  it('rejects a validly-signed theme that imports a forbidden module', async () => {
    const db = await testDb()
    const { publicKey, privateKey } = generateSigningKeyPair()
    const manifest = validManifest('sneaky-theme')
    await writeFile(join(dir, 'tokens.json'), JSON.stringify(VALID_TOKENS), 'utf8')
    await writeFile(join(dir, 'evil.mjs'), "import fs from 'node:fs'\n", 'utf8')

    const registry = createThemeRegistry(db, { trustedPublicKeys: [publicKey] })
    const entry = await registry.submit({
      submitterId: 'author-1',
      displayName: 'Sneaky Theme',
      manifest,
      themeRoot: dir,
      signatureBase64: signContent(manifest, privateKey),
    })

    expect(entry.status).toBe('rejected')
    expect(entry.rejectionCode).toBe('THEME_IMPORT_FORBIDDEN')
  })

  it('rejects a validly-signed, contract-clean theme whose default skin fails validateSkin', async () => {
    const db = await testDb()
    const { publicKey, privateKey } = generateSigningKeyPair()
    const manifest = validManifest('bad-skin-theme')
    const { motion: _drop, ...invalidTokens } = VALID_TOKENS
    await writeFile(join(dir, 'tokens.json'), JSON.stringify(invalidTokens), 'utf8')

    const registry = createThemeRegistry(db, { trustedPublicKeys: [publicKey] })
    const entry = await registry.submit({
      submitterId: 'author-1',
      displayName: 'Bad Skin Theme',
      manifest,
      themeRoot: dir,
      signatureBase64: signContent(manifest, privateKey),
    })

    expect(entry.status).toBe('rejected')
    expect(entry.rejectionCode).toBe('SKIN_TOKEN_MISSING')
  })

  it('retrieves a submission by id, and returns null for an unknown one', async () => {
    const db = await testDb()
    const { publicKey, privateKey } = generateSigningKeyPair()
    const manifest = validManifest('fetchable-theme')
    await writeFile(join(dir, 'tokens.json'), JSON.stringify(VALID_TOKENS), 'utf8')

    const registry = createThemeRegistry(db, { trustedPublicKeys: [publicKey] })
    const entry = await registry.submit({
      submitterId: 'author-1',
      displayName: 'Fetchable Theme',
      manifest,
      themeRoot: dir,
      signatureBase64: signContent(manifest, privateKey),
    })

    expect((await registry.get(entry.id))?.status).toBe('accepted')
    expect(await registry.get('nonexistent-id')).toBeNull()
  })
})
