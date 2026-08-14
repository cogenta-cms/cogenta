import { beforeEach, describe, expect, it } from 'vitest'
import { createPluginGrantStore, type PluginGrantStore } from '../../src/permissions/grants.js'
import { testDb } from '../helpers/db.js'

describe('createPluginGrantStore', () => {
  let store: PluginGrantStore

  beforeEach(async () => {
    const db = await testDb()
    store = createPluginGrantStore(db)
  })

  it('grants a capability and lists it back', async () => {
    await store.grant('@auteur/mon-plugin', 'content.read')
    const grants = await store.listGrants('@auteur/mon-plugin')
    expect(grants).toHaveLength(1)
    expect(grants[0]?.capability).toBe('content.read')
  })

  it('keeps two different parameterised capabilities of the same plugin distinct', async () => {
    await store.grant('@auteur/mon-plugin', 'http.fetch:api.exemple.com')
    await store.grant('@auteur/mon-plugin', 'http.fetch:other.exemple.com')
    const grants = await store.listGrants('@auteur/mon-plugin')
    expect(grants.map((g) => g.capability).sort()).toEqual([
      'http.fetch:api.exemple.com',
      'http.fetch:other.exemple.com',
    ])
  })

  it('re-granting an already-active capability does not duplicate it', async () => {
    await store.grant('@auteur/mon-plugin', 'content.read')
    await store.grant('@auteur/mon-plugin', 'content.read')
    const grants = await store.listGrants('@auteur/mon-plugin')
    expect(grants).toHaveLength(1)
  })

  it('revoking removes a capability from the active list', async () => {
    await store.grant('@auteur/mon-plugin', 'content.read')
    await store.revoke('@auteur/mon-plugin', 'content.read')
    expect(await store.listGrants('@auteur/mon-plugin')).toEqual([])
  })

  it('revoking an already-unrevoked-or-nonexistent grant is not an error', async () => {
    await expect(store.revoke('@auteur/mon-plugin', 'content.read')).resolves.toBeUndefined()
  })

  it('keeps grants scoped to their own plugin', async () => {
    await store.grant('@auteur/mon-plugin', 'content.read')
    await store.grant('@auteur/autre-plugin', 'content.read')
    expect(await store.listGrants('@auteur/mon-plugin')).toHaveLength(1)
    expect(await store.listGrants('@auteur/autre-plugin')).toHaveLength(1)
  })
})
