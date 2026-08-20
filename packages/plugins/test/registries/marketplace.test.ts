import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CogentaError, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createPluginDisableStore,
  type PluginDisableStore,
} from '../../src/permissions/disabled.js'
import { createPluginGrantStore, type PluginGrantStore } from '../../src/permissions/grants.js'
import { createPluginUsageStore, type PluginUsageStore } from '../../src/permissions/usage.js'
import {
  createMarketplaceCatalog,
  createMarketplaceInstaller,
  type MarketplaceCatalogEntry,
  type MarketplaceInstaller,
} from '../../src/registries/marketplace.js'
import { generateSigningKeyPair } from '../../src/signing/keys.js'
import { signManifest } from '../../src/signing/sign.js'
import { testDb } from '../helpers/db.js'

function manifestFor(capabilities: readonly string[]) {
  return {
    name: 'marketplace-plugin',
    version: '1.0.0',
    engine: '^1.0.0',
    capabilities,
    provides: {},
    runtime: 'server' as const,
    isolated: true,
  }
}

function manifestSource(capabilities: readonly string[]): string {
  return `export default ${JSON.stringify(manifestFor(capabilities))}\n`
}

async function writePlugin(
  dir: string,
  options: {
    capabilities?: readonly string[]
    sign?: { privateKey: string } | 'wrong-key' | 'none'
  } = {},
): Promise<string> {
  const pluginDir = await mkdtemp(join(dir, 'plugin-'))
  const manifestPath = join(pluginDir, 'plugin.manifest.mjs')
  const capabilities = options.capabilities ?? ['content.read']
  await writeFile(manifestPath, manifestSource(capabilities), 'utf8')

  const sign = options.sign
  if (sign !== undefined && sign !== 'none') {
    const privateKey = sign === 'wrong-key' ? generateSigningKeyPair().privateKey : sign.privateKey
    const signature = signManifest(manifestFor(capabilities), privateKey)
    await writeFile(`${manifestPath}.sig`, signature, 'utf8')
  }

  return pluginDir
}

describe('marketplace catalog and installer (L17)', () => {
  let dir: string
  let db: DatabaseHandle
  let grantStore: PluginGrantStore
  let disableStore: PluginDisableStore
  let usageStore: PluginUsageStore
  let publicKey: string
  let privateKey: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cogenta-marketplace-'))
    db = await testDb()
    grantStore = createPluginGrantStore(db)
    disableStore = createPluginDisableStore(db)
    usageStore = createPluginUsageStore(db)
    ;({ publicKey, privateKey } = generateSigningKeyPair())
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  function installer(engineVersion?: string): MarketplaceInstaller {
    return createMarketplaceInstaller(db, {
      trustedPublicKeys: [publicKey],
      grantStore,
      disableStore,
      usageStore,
      ...(engineVersion === undefined ? {} : { engineVersion }),
    })
  }

  describe('createMarketplaceCatalog', () => {
    const entries: readonly MarketplaceCatalogEntry[] = [
      {
        id: 'seo-helper',
        kind: 'plugin',
        displayName: 'SEO Helper',
        description: 'Suggests meta descriptions.',
        category: 'SEO',
        reference: '/tmp/seo-helper',
      },
      {
        id: 'midnight-theme',
        kind: 'theme',
        displayName: 'Midnight',
        description: 'A dark theme.',
        category: 'Design',
        reference: '/tmp/midnight',
      },
    ]

    it('lists every entry with no filter', () => {
      const catalog = createMarketplaceCatalog(entries)
      expect(catalog.list().map((e) => e.id)).toEqual(['seo-helper', 'midnight-theme'])
    })

    it('filters by kind', () => {
      const catalog = createMarketplaceCatalog(entries)
      expect(catalog.list({ kind: 'theme' }).map((e) => e.id)).toEqual(['midnight-theme'])
    })

    it('searches case-insensitively across displayName/description/category', () => {
      const catalog = createMarketplaceCatalog(entries)
      expect(catalog.list({ query: 'DARK' }).map((e) => e.id)).toEqual(['midnight-theme'])
      expect(catalog.list({ query: 'meta descriptions' }).map((e) => e.id)).toEqual(['seo-helper'])
    })

    it('get() returns null for an unknown id', () => {
      const catalog = createMarketplaceCatalog(entries)
      expect(catalog.get('does-not-exist')).toBeNull()
    })
  })

  describe('install — the security-critical path', () => {
    it('never installs a plugin with no signature, even though its reference is a local path', async () => {
      const pluginDir = await writePlugin(dir, { sign: 'none' })
      const entry: MarketplaceCatalogEntry = {
        id: 'item-1',
        kind: 'plugin',
        displayName: 'Unsigned Plugin',
        description: '',
        category: 'General',
        reference: pluginDir,
      }

      await expect(installer().install(entry, 'user-1')).rejects.toMatchObject({
        code: 'PLUGIN_SIGNATURE_MISSING',
      })
      expect(await installer().list()).toHaveLength(0)
    })

    it('never installs a plugin signed by an untrusted key', async () => {
      const pluginDir = await writePlugin(dir, { sign: 'wrong-key' })
      const entry: MarketplaceCatalogEntry = {
        id: 'item-1',
        kind: 'plugin',
        displayName: 'Maliciously Signed Plugin',
        description: '',
        category: 'General',
        reference: pluginDir,
      }

      await expect(installer().install(entry, 'user-1')).rejects.toMatchObject({
        code: 'PLUGIN_SIGNATURE_INVALID',
      })
      expect(await installer().list()).toHaveLength(0)
    })

    it('installs a plugin with a signature matching a trusted key, and records it', async () => {
      const pluginDir = await writePlugin(dir, { sign: { privateKey } })
      const entry: MarketplaceCatalogEntry = {
        id: 'item-1',
        kind: 'plugin',
        displayName: 'Trusted Plugin',
        description: 'A real plugin.',
        category: 'General',
        reference: pluginDir,
      }

      const record = await installer().install(entry, 'user-1')
      expect(record.signatureVerified).toBe(true)
      expect(record.pluginName).toBe('marketplace-plugin')
      expect(record.pluginVersion).toBe('1.0.0')
      expect(record.installedBy).toBe('user-1')

      const listed = await installer().list()
      expect(listed.map((r) => r.itemId)).toEqual(['item-1'])
    })

    it('refuses to install a non-plugin kind honestly, not silently', async () => {
      const entry: MarketplaceCatalogEntry = {
        id: 'item-1',
        kind: 'theme',
        displayName: 'Some Theme',
        description: '',
        category: 'Design',
        reference: '/tmp/does-not-matter',
      }

      await expect(installer().install(entry, 'user-1')).rejects.toMatchObject({
        code: 'MARKETPLACE_KIND_UNSUPPORTED',
      })
    })

    it('reinstalling the same item id is idempotent, not a duplicate row', async () => {
      const pluginDir = await writePlugin(dir, { sign: { privateKey } })
      const entry: MarketplaceCatalogEntry = {
        id: 'item-1',
        kind: 'plugin',
        displayName: 'Trusted Plugin',
        description: '',
        category: 'General',
        reference: pluginDir,
      }
      await installer().install(entry, 'user-1')
      await installer().install(entry, 'user-2')

      const listed = await installer().list()
      expect(listed).toHaveLength(1)
      expect(listed[0]?.installedBy).toBe('user-2')
    })

    it('uninstall removes the record', async () => {
      const pluginDir = await writePlugin(dir, { sign: { privateKey } })
      const entry: MarketplaceCatalogEntry = {
        id: 'item-1',
        kind: 'plugin',
        displayName: 'Trusted Plugin',
        description: '',
        category: 'General',
        reference: pluginDir,
      }
      await installer().install(entry, 'user-1')
      await installer().uninstall('item-1')
      expect(await installer().get('item-1')).toBeNull()
    })
  })

  describe('preview — the "fiche détaillée" (task 3)', () => {
    it('describes a trusted plugin’s capabilities in plain language', async () => {
      const pluginDir = await writePlugin(dir, {
        capabilities: ['content.read', 'content.publish'],
        sign: { privateKey },
      })
      const entry: MarketplaceCatalogEntry = {
        id: 'item-1',
        kind: 'plugin',
        displayName: 'Trusted Plugin',
        description: '',
        category: 'General',
        reference: pluginDir,
      }

      const preview = await installer().preview(entry)
      expect(preview.signatureVerified).toBe(true)
      expect(preview.capabilities.map((c) => c.capability).sort()).toEqual([
        'content.publish',
        'content.read',
      ])
      expect(preview.capabilities.every((c) => c.sentence.length > 0)).toBe(true)
      const publish = preview.capabilities.find((c) => c.capability === 'content.publish')
      expect(publish?.riskLevel).toBe('high')
    })

    it('reports the real failure — never a silent empty result — for a badly-signed plugin', async () => {
      const pluginDir = await writePlugin(dir, { sign: 'wrong-key' })
      const entry: MarketplaceCatalogEntry = {
        id: 'item-1',
        kind: 'plugin',
        displayName: 'Maliciously Signed Plugin',
        description: '',
        category: 'General',
        reference: pluginDir,
      }

      const preview = await installer().preview(entry)
      expect(preview.signatureVerified).toBe(false)
      expect(preview.error?.code).toBe('PLUGIN_SIGNATURE_INVALID')
      expect(preview.capabilities).toHaveLength(0)
    })

    it('flags a non-plugin kind as unsupported rather than pretending to describe it', async () => {
      const entry: MarketplaceCatalogEntry = {
        id: 'item-1',
        kind: 'skin',
        displayName: 'Some Skin',
        description: '',
        category: 'Design',
        reference: '/tmp/does-not-matter',
      }
      const preview = await installer().preview(entry)
      expect(preview.supported).toBe(false)
    })
  })

  describe('update — never applies an elevated permission silently (task 4)', () => {
    async function installBaseline(): Promise<MarketplaceCatalogEntry> {
      const pluginDir = await writePlugin(dir, {
        capabilities: ['content.read'],
        sign: { privateKey },
      })
      const entry: MarketplaceCatalogEntry = {
        id: 'item-1',
        kind: 'plugin',
        displayName: 'Trusted Plugin',
        description: '',
        category: 'General',
        reference: pluginDir,
      }
      await installer().install(entry, 'user-1')
      await grantStore.grant('marketplace-plugin', 'content.read')
      return entry
    }

    it('refuses an update that would silently widen permissions', async () => {
      await installBaseline()
      const widenedDir = await writePlugin(dir, {
        capabilities: ['content.read', 'content.publish'],
        sign: { privateKey },
      })
      const widenedEntry: MarketplaceCatalogEntry = {
        id: 'item-1',
        kind: 'plugin',
        displayName: 'Trusted Plugin',
        description: '',
        category: 'General',
        reference: widenedDir,
      }

      await expect(installer().update(widenedEntry, 'user-1')).rejects.toMatchObject({
        code: 'MARKETPLACE_UPDATE_REQUIRES_APPROVAL',
      })

      // The stored record is untouched — the update never half-applied.
      const record = await installer().get('item-1')
      expect(record?.pluginVersion).toBe('1.0.0')
    })

    it('applies the version bump once the caller explicitly confirms, but never auto-grants the new capability', async () => {
      await installBaseline()
      const widenedDir = await writePlugin(dir, {
        capabilities: ['content.read', 'content.publish'],
        sign: { privateKey },
      })
      const widenedEntry: MarketplaceCatalogEntry = {
        id: 'item-1',
        kind: 'plugin',
        displayName: 'Trusted Plugin',
        description: '',
        category: 'General',
        reference: widenedDir,
      }

      const result = await installer().update(widenedEntry, 'user-1', {
        confirmPendingPermissions: true,
      })
      expect(result.pendingApproval.map((p) => p.capability)).toEqual(['content.publish'])

      const grants = await grantStore.listGrants('marketplace-plugin')
      expect(grants.map((g) => g.capability)).toEqual(['content.read'])
    })

    it('an update declaring no new capability requires no confirmation', async () => {
      const entry = await installBaseline()
      const result = await installer().update(entry, 'user-1')
      expect(result.pendingApproval).toHaveLength(0)
    })

    it('still verifies signature on update — an untrusted new reference is refused', async () => {
      await installBaseline()
      const badDir = await writePlugin(dir, { sign: 'wrong-key' })
      const badEntry: MarketplaceCatalogEntry = {
        id: 'item-1',
        kind: 'plugin',
        displayName: 'Trusted Plugin',
        description: '',
        category: 'General',
        reference: badDir,
      }

      await expect(installer().update(badEntry, 'user-1')).rejects.toMatchObject({
        code: 'PLUGIN_SIGNATURE_INVALID',
      })
    })

    it('refuses to update an item that was never installed', async () => {
      const entry: MarketplaceCatalogEntry = {
        id: 'never-installed',
        kind: 'plugin',
        displayName: 'Ghost',
        description: '',
        category: 'General',
        reference: dir,
      }
      await expect(installer().update(entry, 'user-1')).rejects.toMatchObject({
        code: 'MARKETPLACE_NOT_INSTALLED',
      })
    })
  })

  describe('fiche 29 — activate/deactivate (task 1)', () => {
    it('a freshly installed item is enabled by default, and can be toggled', async () => {
      const pluginDir = await writePlugin(dir, { sign: { privateKey } })
      const entry: MarketplaceCatalogEntry = {
        id: 'item-1',
        kind: 'plugin',
        displayName: 'Trusted Plugin',
        description: '',
        category: 'General',
        reference: pluginDir,
      }
      const record = await installer().install(entry, 'user-1')
      expect(record.enabled).toBe(true)

      const deactivated = await installer().deactivate('item-1')
      expect(deactivated.enabled).toBe(false)
      expect((await installer().get('item-1'))?.enabled).toBe(false)

      const reactivated = await installer().activate('item-1')
      expect(reactivated.enabled).toBe(true)
    })

    it('toggling an item that is not installed refuses honestly', async () => {
      await expect(installer().activate('ghost')).rejects.toMatchObject({
        code: 'MARKETPLACE_NOT_INSTALLED',
      })
    })
  })

  describe('fiche 29 — engine compatibility (task 5)', () => {
    it('without a configured Cogenta version, install never fabricates a refusal', async () => {
      const pluginDir = await writePlugin(dir, { sign: { privateKey } })
      const entry: MarketplaceCatalogEntry = {
        id: 'item-1',
        kind: 'plugin',
        displayName: 'Trusted Plugin',
        description: '',
        category: 'General',
        reference: pluginDir,
      }
      // No `engineVersion` configured — installer() defaults to none.
      await expect(installer().install(entry, 'user-1')).resolves.toMatchObject({
        pluginVersion: '1.0.0',
      })
      const preview = await installer().preview(entry)
      expect(preview.engineCompatible).toBeNull()
      expect(preview.latestVersion).toBe('1.0.0')
      expect(preview.source).toBe('registry')
    })

    it('refuses to install a plugin incompatible with a configured Cogenta version', async () => {
      const pluginDir = await writePlugin(dir, { sign: { privateKey } }) // engine: ^1.0.0
      const entry: MarketplaceCatalogEntry = {
        id: 'item-1',
        kind: 'plugin',
        displayName: 'Trusted Plugin',
        description: '',
        category: 'General',
        reference: pluginDir,
      }
      await expect(installer('2.0.0').install(entry, 'user-1')).rejects.toMatchObject({
        code: 'MARKETPLACE_ENGINE_INCOMPATIBLE',
      })
      expect(await installer('2.0.0').list()).toHaveLength(0)
    })

    it('installs when the configured Cogenta version satisfies the engine range', async () => {
      const pluginDir = await writePlugin(dir, { sign: { privateKey } }) // engine: ^1.0.0
      const entry: MarketplaceCatalogEntry = {
        id: 'item-1',
        kind: 'plugin',
        displayName: 'Trusted Plugin',
        description: '',
        category: 'General',
        reference: pluginDir,
      }
      const record = await installer('1.4.0').install(entry, 'user-1')
      expect(record.pluginVersion).toBe('1.0.0')
      const preview = await installer('1.4.0').preview(entry)
      expect(preview.engineCompatible).toBe(true)
    })
  })

  describe('fiche 29 — uninstall with data removal (task 4)', () => {
    async function installWithGrantAndUsage(): Promise<MarketplaceCatalogEntry> {
      const pluginDir = await writePlugin(dir, { sign: { privateKey } })
      const entry: MarketplaceCatalogEntry = {
        id: 'item-1',
        kind: 'plugin',
        displayName: 'Trusted Plugin',
        description: '',
        category: 'General',
        reference: pluginDir,
      }
      await installer().install(entry, 'user-1')
      await grantStore.grant('marketplace-plugin', 'content.read')
      await usageStore.recordRun('marketplace-plugin', { durationMs: 10, ok: true })
      await disableStore.disable('marketplace-plugin', 'crash', 'boom')
      return entry
    }

    it('a plain uninstall leaves grants, usage and the disable record untouched', async () => {
      await installWithGrantAndUsage()
      await installer().uninstall('item-1')

      expect(await installer().get('item-1')).toBeNull()
      expect(await grantStore.listGrants('marketplace-plugin')).toHaveLength(1)
      expect(await usageStore.getUsage('marketplace-plugin')).not.toBeNull()
      expect(await disableStore.isDisabled('marketplace-plugin')).not.toBeNull()
    })

    it('removeData: true also revokes grants, clears usage and the disable record', async () => {
      await installWithGrantAndUsage()
      await installer().uninstall('item-1', { removeData: true })

      expect(await installer().get('item-1')).toBeNull()
      expect(await grantStore.listGrants('marketplace-plugin')).toHaveLength(0)
      expect(await usageStore.getUsage('marketplace-plugin')).toBeNull()
      expect(await disableStore.isDisabled('marketplace-plugin')).toBeNull()
    })
  })

  it('every thrown error is a real CogentaError, never a bare Error', async () => {
    const pluginDir = await writePlugin(dir, { sign: 'none' })
    const entry: MarketplaceCatalogEntry = {
      id: 'item-1',
      kind: 'plugin',
      displayName: 'Unsigned Plugin',
      description: '',
      category: 'General',
      reference: pluginDir,
    }
    try {
      await installer().install(entry, 'user-1')
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(CogentaError)
    }
  })
})
