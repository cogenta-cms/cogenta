import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ARTICLE,
  asEditor,
  asViewer,
  createHarness,
  dataOf,
  type Harness,
  request,
} from './harness.js'

/**
 * `POST /-/replace` (L34) — the tool for the day a brand is renamed.
 *
 * What these assert is the promise the lot rests on: a preview writes
 * nothing, an application writes exactly what the preview showed, and both
 * are computed by the same code.
 */

describe('POST /-/replace', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness()
  })

  afterEach(async () => {
    await harness.dispose()
  })

  const replace = async (body: Record<string, unknown>, context = asEditor) =>
    dataOf(await harness.router.handle(request('POST', '/-/replace', { body }), context))

  it('previews without writing a single character', async () => {
    const store = harness.store(ARTICLE)
    const entry = await store.create({
      values: { title: 'Cogenta arrive', summary: 'Cogenta, en bref' },
    })

    const preview = await replace({ find: 'Cogenta', replace: 'Kogenta' })

    expect(preview['applied']).toBe(false)
    const entries = preview['entries'] as { entryId: string; occurrences: number }[]
    expect(entries).toHaveLength(1)
    expect(entries[0]?.occurrences).toBe(2)

    // Nothing was written: the whole point of a preview.
    const after = await store.read(entry.id, { state: 'working' })
    expect(after?.values['title']).toBe('Cogenta arrive')
  })

  it('writes exactly what it showed, through the ordinary update path', async () => {
    const store = harness.store(ARTICLE)
    const entry = await store.create({ values: { title: 'Cogenta arrive' } })
    const before = await store.read(entry.id, { state: 'working' })

    const applied = await replace({ find: 'Cogenta', replace: 'Kogenta', apply: true })

    expect(applied['applied']).toBe(true)
    const after = await store.read(entry.id, { state: 'working' })
    expect(after?.values['title']).toBe('Kogenta arrive')
    // A new version, so the change is in the history and can be restored
    // entry by entry — which a direct UPDATE would not give.
    expect(after?.version).toBe((before?.version ?? 0) + 1)
  })

  it('leaves alone an entry that moved between the preview and the application', async () => {
    const store = harness.store(ARTICLE)
    const entry = await store.create({ values: { title: 'Cogenta arrive' } })

    await replace({ find: 'Cogenta', replace: 'Kogenta' })
    // Someone edits it in the meantime, and the phrase is gone.
    await store.update(entry.id, { values: { title: 'Rien à voir' } })

    const applied = await replace({ find: 'Cogenta', replace: 'Kogenta', apply: true })

    expect(applied['entries']).toEqual([])
    expect((await store.read(entry.id, { state: 'working' }))?.values['title']).toBe('Rien à voir')
  })

  it('searches only the collections this actor may edit', async () => {
    const store = harness.store(ARTICLE)
    await store.create({ values: { title: 'Cogenta arrive' } })

    // A viewer may read the collection but not update it: a preview shows the
    // text around every match, so letting it run would be reading in bulk
    // through a tool meant for editing.
    const preview = await replace({ find: 'Cogenta', replace: 'Kogenta' }, asViewer)

    expect(preview['entries']).toEqual([])
    expect(preview['scanned']).toBe(0)
  })

  it('refuses an empty search rather than matching everything', async () => {
    const response = await harness.router.handle(
      request('POST', '/-/replace', { body: { find: '', replace: 'x' } }),
      asEditor,
    )

    // Refused at the door, by the body schema, before any collection is read.
    expect(response.status).toBe(400)
  })

  it('says when it stopped early instead of pretending it saw everything', async () => {
    const store = harness.store(ARTICLE)
    for (let index = 0; index < 5; index += 1) {
      await store.create({ values: { title: `Cogenta ${index}` } })
    }

    const preview = await replace({ find: 'Cogenta', replace: 'K', limit: 2 })

    expect((preview['entries'] as unknown[]).length).toBe(2)
    expect(preview['truncated']).toBe(true)
  })
})
