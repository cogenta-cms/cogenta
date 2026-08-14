import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import { createContentStore, createSchemaTables, dropSchemaTables } from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createContentReadHandler } from '../../src/host/capabilities.js'
import { runPlugin } from '../../src/host/worker-runner.js'
import type { PluginManifest } from '../../src/manifest.js'
import { createPluginGrantStore } from '../../src/permissions/grants.js'
import { testDb as permissionsDb } from '../helpers/db.js'

const article: CollectionDefinition = {
  name: 'run_plugin_test_article',
  labels: { singular: 'Article', plural: 'Articles' },
  fields: { title: { kind: 'text', options: { max: 120 } } },
  permissions: { read: ['public'] },
}

function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    name: '@auteur/mon-plugin',
    version: '1.0.0',
    engine: '^1.0.0',
    capabilities: ['content.read'],
    provides: {},
    runtime: 'server',
    isolated: true,
    ...overrides,
  }
}

describe('runPlugin — the real entry point, grant resolution end to end', () => {
  let directory: string
  let contentDb: DatabaseHandle
  let grantDb: DatabaseHandle

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-run-plugin-'))
    contentDb = await createSqliteHandle({ url: join(directory, 'store.db') })
    await createSchemaTables(contentDb, [article])
    grantDb = await permissionsDb()
  })

  afterEach(async () => {
    await dropSchemaTables(contentDb, [article])
    await contentDb.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('a capability with a real grant row reaches the sandboxed SDK; without one, it is absent', async () => {
    const store = createContentStore({ db: contentDb, collection: article })
    const seeded = await store.create({ status: 'published', values: { title: 'Via runPlugin' } })
    const handlers = { 'content.read': createContentReadHandler((id) => store.read(id)) }
    const code = `('content' in sdk) ? sdk.content.read({ id: ${JSON.stringify(seeded.id)} }).then((e) => e.values.title) : 'ABSENT'`

    const withoutGrant = await runPlugin(manifest(), code, [], { handlers })
    expect(withoutGrant).toEqual({ ok: true, value: 'ABSENT' })

    const grantStore = createPluginGrantStore(grantDb)
    await grantStore.grant('@auteur/mon-plugin', 'content.read')
    const grants = await grantStore.listGrants('@auteur/mon-plugin')

    const withGrant = await runPlugin(manifest(), code, grants, { handlers })
    expect(withGrant).toEqual({ ok: true, value: 'Via runPlugin' })
  })

  it('an updated manifest never auto-runs with a newly declared capability the old grants never covered', async () => {
    const grantStore = createPluginGrantStore(grantDb)
    await grantStore.grant('@auteur/mon-plugin', 'content.read')
    const oldGrants = await grantStore.listGrants('@auteur/mon-plugin')

    const newManifest = manifest({
      capabilities: ['content.read', 'http.fetch:new.exemple.com'],
    })
    const code = `('http' in sdk) ? 'ESCALATED' : 'contained'`

    // Running the new manifest against the OLD (unrevised) grants must never
    // expose the capability that was never actually approved for it.
    const result = await runPlugin(newManifest, code, oldGrants, {})
    expect(result).toEqual({ ok: true, value: 'contained' })
  })
})
