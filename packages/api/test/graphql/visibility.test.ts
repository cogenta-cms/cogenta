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

  const SECRET_BLOCK = {
    key: 'b1',
    type: 'richText',
    data: { text: 'The vault combination is 12-34-56.' },
  }

  async function protectedArticle(title: string): Promise<string> {
    const store = harness.stores.get(ARTICLE.name)
    if (store === undefined) throw new Error('no store')
    const entry = await store.create({
      values: { title, views: 4242, featured: true },
      blocks: { body: [SECRET_BLOCK] },
      status: 'published',
    })
    await store.publish(entry.id)
    await store.setVisibility(entry.id, 'password', { passwordHash: 'not-a-real-hash' })
    return entry.id
  }

  it('lists a password-protected entry and shows its title, nothing else of it', async () => {
    const locked = await protectedArticle('Dossier de presse')

    // A protected page exists and can be linked to — but what the password
    // gates is its content, on every transport and not only in the renderer.
    const read = await harness.gateway.read(ARTICLE.name, locked, asPublic())
    expect(read).not.toBeNull()
    expect(read?.visibility).toBe('password')
    expect(read?.values['title']).toBe('Dossier de presse')
    expect(read?.values['views']).toBeUndefined()
    expect(read?.values['featured']).toBeUndefined()
    expect(read?.blocks).toEqual({})

    const listed = await harness.gateway.list({ collection: ARTICLE.name }, asPublic())
    expect(listed.items.map((entry) => entry.values['title'])).toContain('Dossier de presse')
    expect(JSON.stringify(listed.items)).not.toContain('12-34-56')
    expect(JSON.stringify(listed.items)).not.toContain('4242')
  })

  it('keeps the content of a protected entry out of a batched relation read', async () => {
    const locked = await protectedArticle('Dossier de presse')

    const batched = await harness.gateway.readMany(ARTICLE.name, [locked], asPublic())

    const entry = batched.get(locked)
    expect(entry?.values['title']).toBe('Dossier de presse')
    expect(JSON.stringify(entry)).not.toContain('12-34-56')
    expect(entry?.values['views']).toBeUndefined()
  })

  it('does not let a filter on a hidden field reveal what a protected entry holds', async () => {
    await protectedArticle('Dossier de presse')

    const guessed = await harness.gateway.list(
      {
        collection: ARTICLE.name,
        filter: { field: 'views', operator: 'eq', value: 4242 },
      },
      asPublic(),
    )

    expect(guessed.items).toEqual([])
  })

  it('shows the whole protected entry to someone who may edit the collection', async () => {
    const locked = await protectedArticle('Dossier de presse')

    const read = await harness.gateway.read(ARTICLE.name, locked, asEditor())
    expect(read?.values['views']).toBe(4242)
    expect(JSON.stringify(read?.blocks)).toContain('12-34-56')
  })

  it('shows the whole protected entry to a visitor who has proved the password for that entry only', async () => {
    const unlocked = await protectedArticle('Dossier A')
    const other = await protectedArticle('Dossier B')
    const context = { ...asPublic(), unlocked: (id: string) => id === unlocked }

    const opened = await harness.gateway.read(ARTICLE.name, unlocked, context)
    const stillLocked = await harness.gateway.read(ARTICLE.name, other, context)
    const listed = await harness.gateway.list({ collection: ARTICLE.name }, context)

    expect(opened?.values['views']).toBe(4242)
    expect(JSON.stringify(opened?.blocks)).toContain('12-34-56')
    expect(stillLocked?.values['views']).toBeUndefined()
    expect(stillLocked?.blocks).toEqual({})
    const byTitle = new Map(listed.items.map((entry) => [entry.values['title'], entry]))
    expect(byTitle.get('Dossier A')?.values['views']).toBe(4242)
    expect(byTitle.get('Dossier B')?.values['views']).toBeUndefined()
  })

  it('returns no content of a protected entry through a GraphQL query, even for required fields', async () => {
    await protectedArticle('Dossier de presse')

    const response = await harness.run(
      `query { gqlArticles { edges { node { title views featured body { type data } } } } }`,
      asPublic(),
    )

    expect(response.errors).toBeUndefined()
    const text = JSON.stringify(response.data)
    expect(text).toContain('Dossier de presse')
    expect(text).not.toContain('12-34-56')
    expect(text).not.toContain('4242')
  })

  it('returns no content of a protected entry through a GraphQL relation', async () => {
    const store = harness.stores.get(ARTICLE.name)
    if (store === undefined) throw new Error('no store')
    const locked = await protectedArticle('Dossier de presse')
    const host = await publishedArticle('Hôte')
    await store.update(host, { values: { related: [locked] } })
    await store.publish(host)

    const response = await harness.run(
      `query { gqlArticles { edges { node { title related { title views body { data } } } } } }`,
      asPublic(),
    )

    expect(response.errors).toBeUndefined()
    const text = JSON.stringify(response.data)
    expect(text).toContain('Dossier de presse')
    expect(text).not.toContain('12-34-56')
    expect(text).not.toContain('4242')
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
