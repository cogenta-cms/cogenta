import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import {
  createMarketplaceCatalog,
  createMarketplaceInstaller,
  createPluginDisableStore,
  createPluginGrantStore,
  createPluginUsageStore,
  describeCapability,
  ensureMarketplaceTables,
  ensurePluginTables,
  ensureRegistryTables,
  generateSigningKeyPair,
  type MarketplaceCatalogEntry,
  type MarketplaceInstaller,
  type PluginDisableStore,
  type PluginGrantStore,
  type PluginUsageStore,
  signManifest,
} from '@cogenta/plugins'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createMarketplaceRouter,
  type MarketplaceRouter,
} from '../../src/rest/marketplace-router.js'
import { ANONYMOUS } from '../../src/types.js'

const ADMIN = { id: 'user-admin', roles: ['admin'] }
const EDITOR = { id: 'user-editor', roles: ['editor'] }

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

async function writeSignedPlugin(
  dir: string,
  privateKey: string,
  capabilities: readonly string[] = ['content.read'],
): Promise<string> {
  const pluginDir = await mkdtemp(join(dir, 'plugin-'))
  const manifestPath = join(pluginDir, 'plugin.manifest.mjs')
  await writeFile(
    manifestPath,
    `export default ${JSON.stringify(manifestFor(capabilities))}\n`,
    'utf8',
  )
  await writeFile(
    `${manifestPath}.sig`,
    signManifest(manifestFor(capabilities), privateKey),
    'utf8',
  )
  return pluginDir
}

describe('createMarketplaceRouter (L17)', () => {
  let dir: string
  let db: DatabaseHandle
  let installer: MarketplaceInstaller
  let router: MarketplaceRouter
  let publicKey: string
  let privateKey: string
  let pluginDir: string
  let catalogEntry: MarketplaceCatalogEntry
  let grantStore: PluginGrantStore
  let disableStore: PluginDisableStore
  let usageStore: PluginUsageStore

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cogenta-marketplace-router-'))
    db = await createSqliteHandle({ url: ':memory:' })
    await ensurePluginTables(db)
    await ensureRegistryTables(db)
    await ensureMarketplaceTables(db)
    ;({ publicKey, privateKey } = generateSigningKeyPair())
    pluginDir = await writeSignedPlugin(dir, privateKey)

    catalogEntry = {
      id: 'seo-helper',
      kind: 'plugin',
      displayName: 'SEO Helper',
      description: 'Suggests meta descriptions.',
      category: 'SEO',
      reference: pluginDir,
      author: 'Cogenta',
      screenshots: ['https://example.test/shot.png'],
      changelog: [{ version: '1.0.0', notes: 'First release.' }],
    }

    grantStore = createPluginGrantStore(db)
    disableStore = createPluginDisableStore(db)
    usageStore = createPluginUsageStore(db)
    installer = createMarketplaceInstaller(db, { trustedPublicKeys: [publicKey], grantStore })
    const catalog = createMarketplaceCatalog([catalogEntry])
    router = createMarketplaceRouter({ catalog, installer })
  })

  /** A richer router wired with disable/usage/grant stores — used by the "installed" and "updates" describe blocks below. */
  function richRouter(
    entries: readonly MarketplaceCatalogEntry[] = [catalogEntry],
  ): MarketplaceRouter {
    return createMarketplaceRouter({
      catalog: createMarketplaceCatalog(entries),
      installer,
      disableStore,
      usageStore,
      grantStore,
      describeCapability,
    })
  }

  afterEach(async () => {
    await db.close()
    await rm(dir, { recursive: true, force: true })
  })

  describe('permissions', () => {
    it('refuses an editor', async () => {
      const response = await router.handle(
        { method: 'GET', path: '/api/marketplace/items', query: {} },
        EDITOR,
      )
      expect(response.status).toBe(403)
    })

    it('refuses an anonymous caller', async () => {
      const response = await router.handle(
        { method: 'GET', path: '/api/marketplace/items', query: {} },
        ANONYMOUS,
      )
      expect(response.status).toBe(403)
    })
  })

  describe('GET /api/marketplace/items', () => {
    it('lists the catalog, flagging nothing as installed yet', async () => {
      const response = await router.handle(
        { method: 'GET', path: '/api/marketplace/items', query: {} },
        ADMIN,
      )
      expect(response.status).toBe(200)
      const body = response.body as { data: readonly Record<string, unknown>[] }
      expect(body.data).toHaveLength(1)
      expect(body.data[0]).toMatchObject({ id: 'seo-helper', installed: false })
    })

    it('filters by kind and by free-text query', async () => {
      const noMatch = await router.handle(
        { method: 'GET', path: '/api/marketplace/items', query: { kind: 'theme' } },
        ADMIN,
      )
      expect((noMatch.body as { data: unknown[] }).data).toHaveLength(0)

      const match = await router.handle(
        { method: 'GET', path: '/api/marketplace/items', query: { q: 'meta description' } },
        ADMIN,
      )
      expect((match.body as { data: unknown[] }).data).toHaveLength(1)
    })
  })

  describe('GET /api/marketplace/items/:id — the fiche détaillée (task 3)', () => {
    it('describes capabilities in plain language for a trusted item', async () => {
      const response = await router.handle(
        { method: 'GET', path: '/api/marketplace/items/seo-helper', query: {} },
        ADMIN,
      )
      expect(response.status).toBe(200)
      const body = response.body as {
        data: { signatureVerified: boolean; capabilities: readonly { capability: string }[] }
      }
      expect(body.data.signatureVerified).toBe(true)
      expect(body.data.capabilities.map((c) => c.capability)).toEqual(['content.read'])
    })

    it('404s for an unknown id', async () => {
      const response = await router.handle(
        { method: 'GET', path: '/api/marketplace/items/does-not-exist', query: {} },
        ADMIN,
      )
      expect(response.status).toBe(404)
    })
  })

  describe('POST /api/marketplace/items/:id/install — the security-critical line', () => {
    it('installs a validly-signed item and it now shows as installed', async () => {
      const response = await router.handle(
        { method: 'POST', path: '/api/marketplace/items/seo-helper/install', query: {} },
        ADMIN,
      )
      expect(response.status).toBe(201)

      const list = await router.handle(
        { method: 'GET', path: '/api/marketplace/items', query: {} },
        ADMIN,
      )
      const body = list.body as { data: readonly Record<string, unknown>[] }
      expect(body.data[0]).toMatchObject({ id: 'seo-helper', installed: true })
    })

    it('never installs an item whose signature does not verify, even through this route', async () => {
      const { privateKey: attackerKey } = generateSigningKeyPair()
      const badDir = await writeSignedPlugin(dir, attackerKey)
      const badCatalog = createMarketplaceCatalog([{ ...catalogEntry, reference: badDir }])
      const badRouter = createMarketplaceRouter({ catalog: badCatalog, installer })

      const response = await badRouter.handle(
        { method: 'POST', path: '/api/marketplace/items/seo-helper/install', query: {} },
        ADMIN,
      )
      expect(response.status).toBe(422)
      expect((response.body as { error: { code: string } }).error.code).toBe(
        'PLUGIN_SIGNATURE_INVALID',
      )
      expect(await installer.list()).toHaveLength(0)
    })
  })

  describe('POST /api/marketplace/items/:id/update — never a silent permission widening (task 4)', () => {
    it('stops and asks for confirmation when the update would grant a new capability', async () => {
      await router.handle(
        { method: 'POST', path: '/api/marketplace/items/seo-helper/install', query: {} },
        ADMIN,
      )
      const widenedDir = await writeSignedPlugin(dir, privateKey, [
        'content.read',
        'content.publish',
      ])
      const widenedCatalog = createMarketplaceCatalog([{ ...catalogEntry, reference: widenedDir }])
      const widenedRouter = createMarketplaceRouter({ catalog: widenedCatalog, installer })

      const response = await widenedRouter.handle(
        { method: 'POST', path: '/api/marketplace/items/seo-helper/update', query: {}, body: {} },
        ADMIN,
      )
      expect(response.status).toBe(409)
      expect((response.body as { error: { code: string } }).error.code).toBe(
        'MARKETPLACE_UPDATE_REQUIRES_APPROVAL',
      )
    })

    it('applies the update once explicitly confirmed, reporting the newly-pending capability', async () => {
      await router.handle(
        { method: 'POST', path: '/api/marketplace/items/seo-helper/install', query: {} },
        ADMIN,
      )
      const widenedDir = await writeSignedPlugin(dir, privateKey, [
        'content.read',
        'content.publish',
      ])
      const widenedCatalog = createMarketplaceCatalog([{ ...catalogEntry, reference: widenedDir }])
      const widenedRouter = createMarketplaceRouter({ catalog: widenedCatalog, installer })

      const response = await widenedRouter.handle(
        {
          method: 'POST',
          path: '/api/marketplace/items/seo-helper/update',
          query: {},
          body: { confirmPendingPermissions: true },
        },
        ADMIN,
      )
      expect(response.status).toBe(200)
      const body = response.body as {
        data: { pendingApproval: readonly { capability: string }[] }
      }
      // No capability was ever granted for this plugin in this test (that is
      // a separate, explicit `PluginGrantStore.grant` step) — so both the
      // original and the newly-declared capability are still pending, and
      // neither is silently granted by this call.
      expect(body.data.pendingApproval.map((p) => p.capability).sort()).toEqual([
        'content.publish',
        'content.read',
      ])
    })
  })

  describe('POST /api/marketplace/items/:id/uninstall', () => {
    it('removes an installed item', async () => {
      await router.handle(
        { method: 'POST', path: '/api/marketplace/items/seo-helper/install', query: {} },
        ADMIN,
      )
      const response = await router.handle(
        { method: 'POST', path: '/api/marketplace/items/seo-helper/uninstall', query: {} },
        ADMIN,
      )
      expect(response.status).toBe(200)
      expect(await installer.get('seo-helper')).toBeNull()
    })

    it('fiche 29 task 4 — a plain uninstall leaves grants behind; removeData clears them', async () => {
      await router.handle(
        { method: 'POST', path: '/api/marketplace/items/seo-helper/install', query: {} },
        ADMIN,
      )
      await grantStore.grant('marketplace-plugin', 'content.read')

      const plain = await router.handle(
        { method: 'POST', path: '/api/marketplace/items/seo-helper/uninstall', query: {} },
        ADMIN,
      )
      expect(plain.status).toBe(200)
      expect(await grantStore.listGrants('marketplace-plugin')).toHaveLength(1)

      // Reinstall to uninstall again, this time with removeData.
      await router.handle(
        { method: 'POST', path: '/api/marketplace/items/seo-helper/install', query: {} },
        ADMIN,
      )
      const withRemoval = await router.handle(
        {
          method: 'POST',
          path: '/api/marketplace/items/seo-helper/uninstall',
          query: {},
          body: { removeData: true },
        },
        ADMIN,
      )
      expect(withRemoval.status).toBe(200)
      expect((withRemoval.body as { data: { dataRemoved: boolean } }).data.dataRemoved).toBe(true)
      expect(await grantStore.listGrants('marketplace-plugin')).toHaveLength(0)
    })
  })

  describe('fiche 29 task 5 — engine compatibility surfaced on the fiche détaillée', () => {
    it('reports engineCompatible: null (unknown) and the author when no Cogenta version is configured', async () => {
      const response = await router.handle(
        { method: 'GET', path: '/api/marketplace/items/seo-helper', query: {} },
        ADMIN,
      )
      const body = response.body as {
        data: { engineCompatible: boolean | null; author: string | null; source: string | null }
      }
      expect(body.data.engineCompatible).toBeNull()
      expect(body.data.author).toBe('Cogenta')
      expect(body.data.source).toBe('registry')
    })

    it('refuses installation with MARKETPLACE_ENGINE_INCOMPATIBLE once a Cogenta version is configured and unmet', async () => {
      const strictInstaller = createMarketplaceInstaller(db, {
        trustedPublicKeys: [publicKey],
        grantStore,
        engineVersion: '2.0.0', // manifest declares engine: ^1.0.0
      })
      const strictRouter = createMarketplaceRouter({
        catalog: createMarketplaceCatalog([catalogEntry]),
        installer: strictInstaller,
      })
      const response = await strictRouter.handle(
        { method: 'POST', path: '/api/marketplace/items/seo-helper/install', query: {} },
        ADMIN,
      )
      expect(response.status).toBe(422)
      expect((response.body as { error: { code: string } }).error.code).toBe(
        'MARKETPLACE_ENGINE_INCOMPATIBLE',
      )
    })
  })

  describe('fiche 29 task 1 — activate/deactivate', () => {
    it('toggles the enabled flag and is reflected on GET /installed', async () => {
      await router.handle(
        { method: 'POST', path: '/api/marketplace/items/seo-helper/install', query: {} },
        ADMIN,
      )

      const deactivate = await router.handle(
        { method: 'POST', path: '/api/marketplace/items/seo-helper/deactivate', query: {} },
        ADMIN,
      )
      expect(deactivate.status).toBe(200)
      expect((deactivate.body as { data: { enabled: boolean } }).data.enabled).toBe(false)

      const activate = await router.handle(
        { method: 'POST', path: '/api/marketplace/items/seo-helper/activate', query: {} },
        ADMIN,
      )
      expect((activate.body as { data: { enabled: boolean } }).data.enabled).toBe(true)
    })

    it('refuses to toggle an item that was never installed', async () => {
      const response = await router.handle(
        { method: 'POST', path: '/api/marketplace/items/seo-helper/activate', query: {} },
        ADMIN,
      )
      expect(response.status).toBe(404)
    })
  })

  describe('GET /api/marketplace/installed — task 1\'s "installed extensions" screen', () => {
    it('reports capabilities, disabled state and usage for an installed item', async () => {
      await router.handle(
        { method: 'POST', path: '/api/marketplace/items/seo-helper/install', query: {} },
        ADMIN,
      )
      await grantStore.grant('marketplace-plugin', 'content.read')
      await usageStore.recordRun('marketplace-plugin', { durationMs: 42, ok: true })
      await disableStore.disable('marketplace-plugin', 'timeout', 'took too long')

      const response = await richRouter().handle(
        { method: 'GET', path: '/api/marketplace/installed', query: {} },
        ADMIN,
      )
      expect(response.status).toBe(200)
      const body = response.body as {
        data: readonly {
          itemId: string
          enabled: boolean
          disabled: { reason: string; details: string | null } | null
          usage: { callCount: number } | null
          grantedCapabilities: readonly { capability: string; sentence: string }[]
        }[]
      }
      expect(body.data).toHaveLength(1)
      const [item] = body.data
      expect(item?.itemId).toBe('seo-helper')
      expect(item?.enabled).toBe(true)
      expect(item?.disabled).toMatchObject({ reason: 'timeout', details: 'took too long' })
      expect(item?.usage).toMatchObject({ callCount: 1 })
      expect(item?.grantedCapabilities.map((c) => c.capability)).toEqual(['content.read'])
      expect(item?.grantedCapabilities[0]?.sentence.length).toBeGreaterThan(0)
    })

    it('an item never touched by disable/usage stores reports null, not an error', async () => {
      await router.handle(
        { method: 'POST', path: '/api/marketplace/items/seo-helper/install', query: {} },
        ADMIN,
      )
      const response = await richRouter().handle(
        { method: 'GET', path: '/api/marketplace/installed', query: {} },
        ADMIN,
      )
      const body = response.body as {
        data: readonly { disabled: unknown; usage: unknown }[]
      }
      expect(body.data[0]?.disabled).toBeNull()
      expect(body.data[0]?.usage).toBeNull()
    })
  })

  describe('GET/POST /api/marketplace/updates — task 2, grouped update never widens permissions silently', () => {
    it('lists an available update, flagging whether it needs approval', async () => {
      await router.handle(
        { method: 'POST', path: '/api/marketplace/items/seo-helper/install', query: {} },
        ADMIN,
      )
      await grantStore.grant('marketplace-plugin', 'content.read')
      const bumpedDir = await writeSignedPlugin(dir, privateKey, ['content.read'])
      // Overwrite the manifest with a higher version, same capabilities.
      await writeFile(
        join(bumpedDir, 'plugin.manifest.mjs'),
        `export default ${JSON.stringify({ ...manifestFor(['content.read']), version: '1.1.0' })}\n`,
        'utf8',
      )
      await writeFile(
        join(bumpedDir, 'plugin.manifest.mjs.sig'),
        signManifest({ ...manifestFor(['content.read']), version: '1.1.0' }, privateKey),
        'utf8',
      )
      const bumpedEntry = { ...catalogEntry, reference: bumpedDir }

      const list = await richRouter([bumpedEntry]).handle(
        { method: 'GET', path: '/api/marketplace/updates', query: {} },
        ADMIN,
      )
      expect(list.status).toBe(200)
      const body = list.body as {
        data: {
          count: number
          items: readonly { itemId: string; latestVersion: string; requiresApproval: boolean }[]
        }
      }
      expect(body.data.count).toBe(1)
      expect(body.data.items[0]).toMatchObject({
        itemId: 'seo-helper',
        latestVersion: '1.1.0',
        requiresApproval: false,
      })
    })

    it('a grouped apply skips an item whose update would widen permissions, and applies the rest', async () => {
      await router.handle(
        { method: 'POST', path: '/api/marketplace/items/seo-helper/install', query: {} },
        ADMIN,
      )
      await grantStore.grant('marketplace-plugin', 'content.read')

      const widenedManifest = {
        ...manifestFor(['content.read', 'content.publish']),
        version: '1.1.0',
      }
      const widenedDir = await mkdtemp(join(dir, 'plugin-'))
      const widenedManifestPath = join(widenedDir, 'plugin.manifest.mjs')
      await writeFile(
        widenedManifestPath,
        `export default ${JSON.stringify(widenedManifest)}\n`,
        'utf8',
      )
      await writeFile(
        `${widenedManifestPath}.sig`,
        signManifest(widenedManifest, privateKey),
        'utf8',
      )
      const widenedEntry = { ...catalogEntry, reference: widenedDir }

      const apply = await richRouter([widenedEntry]).handle(
        { method: 'POST', path: '/api/marketplace/updates/apply', query: {} },
        ADMIN,
      )
      expect(apply.status).toBe(200)
      const body = apply.body as {
        data: {
          applied: readonly { itemId: string }[]
          skipped: readonly { itemId: string; reason: string }[]
        }
      }
      expect(body.data.applied).toHaveLength(0)
      expect(body.data.skipped).toEqual([{ itemId: 'seo-helper', reason: 'requires_approval' }])

      // Never half-applied: the stored version is unchanged.
      expect((await installer.get('seo-helper'))?.pluginVersion).toBe('1.0.0')
      // And never auto-granted either.
      expect(await grantStore.listGrants('marketplace-plugin')).toEqual([
        expect.objectContaining({ capability: 'content.read' }),
      ])
    })
  })
})
