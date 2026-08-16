import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import {
  createMarketplaceCatalog,
  createMarketplaceInstaller,
  createPluginGrantStore,
  ensureMarketplaceTables,
  ensurePluginTables,
  ensureRegistryTables,
  generateSigningKeyPair,
  type MarketplaceCatalogEntry,
  type MarketplaceInstaller,
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
      screenshots: ['https://example.test/shot.png'],
      changelog: [{ version: '1.0.0', notes: 'First release.' }],
    }

    const grantStore = createPluginGrantStore(db)
    installer = createMarketplaceInstaller(db, { trustedPublicKeys: [publicKey], grantStore })
    const catalog = createMarketplaceCatalog([catalogEntry])
    router = createMarketplaceRouter({ catalog, installer })
  })

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
  })
})
