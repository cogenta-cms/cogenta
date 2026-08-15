import { beforeEach, describe, expect, it } from 'vitest'
import type { PluginManifest } from '../../src/manifest.js'
import { createPluginGrantStore, type PluginGrantStore } from '../../src/permissions/grants.js'
import { resolveGrantedCapabilities } from '../../src/permissions/resolve.js'
import {
  describePendingApproval,
  listGrantedCapabilities,
  revokeCapability,
} from '../../src/permissions/review.js'
import { testDb } from '../helpers/db.js'

function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    name: '@auteur/mon-plugin',
    version: '1.0.0',
    engine: '^1.0.0',
    capabilities: ['content.read', 'http.fetch:api.exemple.com'],
    provides: { tools: [], blocks: [], fields: [], channels: [] },
    runtime: 'server',
    isolated: true,
    ...overrides,
  }
}

describe('listGrantedCapabilities', () => {
  let store: PluginGrantStore

  beforeEach(async () => {
    store = createPluginGrantStore(await testDb())
  })

  it('lists current grants translated, never a raw capability string alone', async () => {
    await store.grant('@auteur/mon-plugin', 'content.read')
    const reviews = await listGrantedCapabilities('@auteur/mon-plugin', store)
    expect(reviews).toHaveLength(1)
    expect(reviews[0]?.capability).toBe('content.read')
    expect(reviews[0]?.description.sentence).toContain('lire le contenu')
    expect(reviews[0]?.description.sentence).not.toContain('content.read')
  })

  it('is empty for a plugin with no grants', async () => {
    expect(await listGrantedCapabilities('@auteur/inconnu', store)).toEqual([])
  })
})

describe('revokeCapability', () => {
  let store: PluginGrantStore

  beforeEach(async () => {
    store = createPluginGrantStore(await testDb())
  })

  it('actually removes the capability from resolveGrantedCapabilities afterward — not just marked revoked', async () => {
    const m = manifest()
    await store.grant(m.name, 'content.read')
    await store.grant(m.name, 'http.fetch:api.exemple.com')

    const before = resolveGrantedCapabilities(m, await store.listGrants(m.name))
    expect(before).toContain('content.read')

    const { stillGranted } = await revokeCapability(m, 'content.read', store)
    expect(stillGranted).toBe(false)

    const after = resolveGrantedCapabilities(m, await store.listGrants(m.name))
    expect(after).not.toContain('content.read')
    expect(after).toContain('http.fetch:api.exemple.com')
  })

  it('revoking a never-granted capability reports it as not granted, without erroring', async () => {
    const m = manifest()
    const { stillGranted } = await revokeCapability(m, 'content.read', store)
    expect(stillGranted).toBe(false)
  })
})

describe('describePendingApproval', () => {
  let store: PluginGrantStore

  beforeEach(async () => {
    store = createPluginGrantStore(await testDb())
  })

  it('surfaces a newly-declared capability beyond what was previously granted, translated', async () => {
    const old = manifest({ capabilities: ['content.read'] })
    await store.grant(old.name, 'content.read')

    const updated = manifest({ capabilities: ['content.read', 'http.fetch:api.exemple.com'] })
    const pending = await describePendingApproval(updated, store)

    expect(pending).toHaveLength(1)
    expect(pending[0]?.capability).toBe('http.fetch:api.exemple.com')
    expect(pending[0]?.description.sentence).not.toContain('http.fetch:')
  })

  it('is empty when the manifest declares nothing beyond what is already granted', async () => {
    const m = manifest({ capabilities: ['content.read'] })
    await store.grant(m.name, 'content.read')
    expect(await describePendingApproval(m, store)).toEqual([])
  })

  it('does not auto-grant the pending capability — resolveGrantedCapabilities still excludes it', async () => {
    const old = manifest({ capabilities: ['content.read'] })
    await store.grant(old.name, 'content.read')
    const updated = manifest({ capabilities: ['content.read', 'http.fetch:api.exemple.com'] })

    await describePendingApproval(updated, store) // observing pending approvals must not grant anything

    const resolved = resolveGrantedCapabilities(updated, await store.listGrants(updated.name))
    expect(resolved).not.toContain('http.fetch:api.exemple.com')
  })
})
