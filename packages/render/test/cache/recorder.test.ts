import { describe, expect, it } from 'vitest'
import {
  createReadRecorder,
  recordDependencies,
  recordingContentClient,
} from '../../src/cache/recorder.js'
import { createContentClient, type FetchLike } from '../../src/index.js'

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

describe('recordDependencies', () => {
  it('adds an entry, media and collection tag for each declared dependency', () => {
    const recorder = createReadRecorder()

    recordDependencies(recorder, { entries: ['a1', 'a2'], media: ['m1'], collections: ['tag'] })

    expect([...recorder.tags()].sort()).toEqual(
      ['entry:a1', 'entry:a2', 'media:m1', 'collection:tag'].sort(),
    )
  })

  it('is a plain merge into the same set a direct read uses', () => {
    // Same tag from two sources is one tag, not two — the point of a Set.
    const recorder = createReadRecorder()
    recorder.recordEntry('a1')

    recordDependencies(recorder, { entries: ['a1'], media: [], collections: [] })

    expect(recorder.tags()).toEqual(['entry:a1'])
  })
})

describe('end to end — a server-expanded relation reaches the recorder', () => {
  it('tags the inlined author even though the theme only asked for the article', async () => {
    // This is the scenario recordingContentClient alone cannot see: the API
    // inlines an author into an article by depth, the author's id never
    // crosses the client as a request of its own. Wiring onDependencies is
    // what closes it.
    const fetch: FetchLike = async () =>
      json({
        data: { id: 'article-1' },
        meta: { dependencies: { entries: ['author:a1'], media: [], collections: [] } },
      })

    const recorder = createReadRecorder()
    const rawClient = createContentClient({
      url: 'https://api.example.test',
      token: 'read-only-token',
      fetch,
      onDependencies: (dependencies) => recordDependencies(recorder, dependencies),
    })
    const client = recordingContentClient(rawClient, recorder)

    await client.entry('article', 'article-1')

    expect(recorder.tags()).toContain('entry:article-1') // the direct read
    expect(recorder.tags()).toContain('entry:a1') // the inlined author
  })
})
