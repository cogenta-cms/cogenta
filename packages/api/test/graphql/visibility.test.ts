import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ARTICLE, asEditor, asPublic, createHarness, type Harness } from './harness.js'

/**
 * L33 step 2 — a private entry does not exist for someone who may not edit
 * it, on **every** read path: by id, in a list, and through a relation.
 *
 * Filtering the rendered page and leaving the row in the API would not be
 * privacy, it would be a rendering preference. This suite exists to make that
 * impossible to ship by accident.
 */

describe('an entry marked private', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness()
  })

  afterEach(async () => {
    await harness.dispose()
  })

  async function publishedArticle(title: string): Promise<string> {
    const store = harness.stores.get(ARTICLE.name)
    if (store === undefined) throw new Error('no store')
    const entry = await store.create({ values: { title }, status: 'published' })
    await store.publish(entry.id)
    return entry.id
  }

  it('is invisible by id, in a list, and through a relation', async () => {
    const store = harness.stores.get(ARTICLE.name)
    if (store === undefined) throw new Error('no store')
    const open = await publishedArticle('Publique')
    const secret = await publishedArticle('Note interne')
    // The related field points at the private entry: a relation is the path
    // that most easily forgets a gate, because it is resolved by a loader.
    await store.update(open, { values: { related: [secret] } })
    await store.publish(open)
    await store.setVisibility(secret, 'private')

    const byId = await harness.gateway.read(ARTICLE.name, secret, asPublic())
    expect(byId).toBeNull()

    const listed = await harness.gateway.list({ collection: ARTICLE.name }, asPublic())
    expect(listed.items.map((entry) => entry.values['title'])).toEqual(['Publique'])

    const batched = await harness.gateway.readMany(ARTICLE.name, [open, secret], asPublic())
    expect([...batched.keys()]).toEqual([open])
  })

  it('is still there for someone who may edit the collection', async () => {
    const store = harness.stores.get(ARTICLE.name)
    if (store === undefined) throw new Error('no store')
    const secret = await publishedArticle('Note interne')
    await store.setVisibility(secret, 'private')

    expect(await harness.gateway.read(ARTICLE.name, secret, asEditor())).not.toBeNull()
    const listed = await harness.gateway.list({ collection: ARTICLE.name }, asEditor())
    expect(listed.items.map((entry) => entry.values['title'])).toContain('Note interne')
  })

  it('does not hide a password-protected entry: it is listed, its content is what is gated', async () => {
    const store = harness.stores.get(ARTICLE.name)
    if (store === undefined) throw new Error('no store')
    const locked = await publishedArticle('Dossier de presse')
    await store.setVisibility(locked, 'password', { passwordHash: 'not-a-real-hash' })

    // Deliberately visible: a protected page exists and can be linked to.
    // What the password gates is the rendered content, not the row.
    expect(await harness.gateway.read(ARTICLE.name, locked, asPublic())).not.toBeNull()
    const listed = await harness.gateway.list({ collection: ARTICLE.name }, asPublic())
    expect(listed.items.map((entry) => entry.values['title'])).toContain('Dossier de presse')
  })

  it('never leaks through GraphQL either — the same gate, the other transport', async () => {
    const store = harness.stores.get(ARTICLE.name)
    if (store === undefined) throw new Error('no store')
    const secret = await publishedArticle('Note interne')
    await store.setVisibility(secret, 'private')

    const response = await harness.run(
      `query { gqlArticles { edges { node { title } } } }`,
      asPublic(),
    )
    const page = response.data?.['gqlArticles'] as
      | { edges: { node: { title: string } }[] }
      | undefined
    expect(page).toBeDefined()
    expect(page?.edges.map((edge) => edge.node.title)).not.toContain('Note interne')
  })
})
