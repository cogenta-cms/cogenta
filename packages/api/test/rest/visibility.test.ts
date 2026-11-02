import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AccessContext } from '../../src/types.js'
import {
  asAdmin,
  asEditor,
  asPublic,
  asViewer,
  bodyOf,
  createHarness,
  dataOf,
  type Harness,
  listOf,
  request,
  valuesOf,
} from './harness.js'

/**
 * Per-entry visibility on the REST transport (`schema@2.3`, ADR-0037).
 *
 * A private entry does not exist for someone who may not edit its collection,
 * and a password-protected one is listed and linkable but keeps its content —
 * values and blocks alike — to itself. Both rules have to hold on every path
 * that returns an entry: a direct read, a list, a URL lookup and the relations
 * REST expands in the same response.
 */

const NOTE: CollectionDefinition = {
  name: 'vis_note',
  labels: { singular: 'Note', plural: 'Notes' },
  routing: { pattern: '/notes/:slug' },
  fields: {
    title: { kind: 'text', required: true, options: { max: 200 } },
    slug: { kind: 'slug', options: { from: 'title' } },
    summary: { kind: 'text', options: { max: 500 } },
    secretCode: { kind: 'text', options: { max: 200 } },
    body: { kind: 'blocks', options: { allow: '*' } },
    related: { kind: 'relation', options: { to: 'vis_note', many: true } },
    main: { kind: 'relation', options: { to: 'vis_note', onDelete: 'setNull' } },
  },
  permissions: {
    read: ['public'],
    create: ['editor'],
    update: ['editor', 'admin'],
    delete: ['admin'],
    publish: ['editor'],
  },
}

const blockOf = (id: string) => ({
  key: 'b1',
  type: 'prose',
  data: { text: `The vault combination is vault-${id}.` },
})

describe('REST visibility', () => {
  let harness: Harness

  const get = (path: string, context: AccessContext, query: Record<string, string> = {}) =>
    harness.router.handle(request('GET', path, { query }), context)

  beforeEach(async () => {
    harness = await createHarness({ collections: [NOTE] })
  })

  afterEach(async () => {
    await harness.dispose()
  })

  async function seed(
    id: string,
    extra: Record<string, unknown> = {},
    visibility: 'public' | 'private' | 'password' = 'public',
  ): Promise<void> {
    const store = harness.store(NOTE)
    await store.create({
      id,
      status: 'published',
      values: {
        title: `Title ${id}`,
        slug: id,
        summary: `Summary of ${id}`,
        secretCode: `code-${id}`,
        ...extra,
      },
      blocks: { body: [blockOf(id)] },
    })
    if (visibility === 'password') {
      await store.setVisibility(id, 'password', { passwordHash: 'not-a-real-hash' })
    } else if (visibility === 'private') {
      await store.setVisibility(id, 'private')
    }
  }

  function expectLocked(entry: Record<string, unknown>, id: string): void {
    expect(entry['id']).toBe(id)
    expect(entry['visibility']).toBe('password')
    expect(entry['status']).toBe('published')
    expect(valuesOf(entry)['title']).toBe(`Title ${id}`)
    expect(valuesOf(entry)['slug']).toBe(id)
    expect(valuesOf(entry)['summary']).toBeUndefined()
    expect(valuesOf(entry)['secretCode']).toBeUndefined()
    expect(entry['blocks']).toEqual({})
    expect(JSON.stringify(entry)).not.toContain(`vault-${id}`)
    expect(JSON.stringify(entry)).not.toContain(`code-${id}`)
  }

  describe('a password-protected entry', () => {
    it.each([
      ['an anonymous visitor', asPublic],
      ['a viewer', asViewer],
    ])('keeps its values and blocks from %s on a direct read', async (_label, context) => {
      await seed('locked', {}, 'password')

      const response = await get('/vis_note/locked', context)

      expect(response.status).toBe(200)
      expectLocked(dataOf(response), 'locked')
    })

    it('keeps its values and blocks out of a list while still listing the title', async () => {
      await seed('locked', {}, 'password')
      await seed('open')

      const response = await get('/vis_note', asPublic)
      const items = listOf(response)

      expect(items.map((item) => item['id']).sort()).toEqual(['locked', 'open'])
      expectLocked(items.find((item) => item['id'] === 'locked') ?? {}, 'locked')
      const open = items.find((item) => item['id'] === 'open') ?? {}
      expect(valuesOf(open)['summary']).toBe('Summary of open')
    })

    it('keeps its content out of a URL lookup', async () => {
      await seed('locked', {}, 'password')

      const response = await get('/-/by-path', asPublic, { path: '/notes/locked' })
      const entry = bodyOf(response)['data'] as Record<string, unknown>

      expectLocked(entry, 'locked')
    })

    it('does not let a filter on a hidden field tell whether its content matches', async () => {
      await seed('locked', {}, 'password')

      const response = await get('/vis_note', asPublic, {
        'filter.secretCode.eq': 'code-locked',
      })

      expect(listOf(response)).toEqual([])
    })

    it.each([
      ['an editor', asEditor],
      ['an administrator', asAdmin],
    ])('stays whole for %s', async (_label, context) => {
      await seed('locked', {}, 'password')

      const entry = dataOf(await get('/vis_note/locked', context))

      expect(valuesOf(entry)['summary']).toBe('Summary of locked')
      expect(valuesOf(entry)['secretCode']).toBe('code-locked')
      expect(JSON.stringify(entry['blocks'])).toContain('vault-locked')
    })

    it('is reduced when it comes through a relation of a public entry', async () => {
      await seed('locked', {}, 'password')
      await seed('host', { main: 'locked', related: ['locked'] })

      const entry = dataOf(await get('/vis_note/host', asPublic, { depth: '2' }))
      const main = valuesOf(entry)['main'] as Record<string, unknown>
      const related = valuesOf(entry)['related'] as Record<string, unknown>[]

      expectLocked(main, 'locked')
      expectLocked(related[0] ?? {}, 'locked')
    })

    it('is whole through a relation for an editor', async () => {
      await seed('locked', {}, 'password')
      await seed('host', { main: 'locked' })

      const entry = dataOf(await get('/vis_note/host', asEditor, { depth: '1' }))
      const main = valuesOf(entry)['main'] as Record<string, unknown>

      expect(valuesOf(main)['secretCode']).toBe('code-locked')
    })
  })

  describe('a private entry reached through a relation', () => {
    it.each([
      ['an anonymous visitor', asPublic],
      ['a viewer', asViewer],
    ])('is not expanded for %s, at any depth', async (_label, context) => {
      await seed('hidden', {}, 'private')
      await seed('c', { main: 'hidden', related: ['hidden'] })
      await seed('b', { main: 'c' })
      await seed('a', { main: 'b' })

      const direct = await get('/vis_note/hidden', context)
      expect(direct.status).toBe(404)

      for (const depth of ['1', '2', '3']) {
        const response = await get('/vis_note/c', context, { depth })
        const text = JSON.stringify(response.body)
        // Not the title, not the code, not the blocks: only the identifier the
        // parent row itself stores.
        expect(text).not.toContain('Title hidden')
        expect(text).not.toContain('code-hidden')
        expect(text).not.toContain('vault-hidden')
        const values = valuesOf(dataOf(response))
        expect(values['main']).toBe('hidden')
        expect(values['related']).toEqual(['hidden'])
      }

      const chain = JSON.stringify((await get('/vis_note/a', context, { depth: '3' })).body)
      expect(chain).not.toContain('code-hidden')
    })

    it('is not expanded in a list either', async () => {
      await seed('hidden', {}, 'private')
      await seed('host', { main: 'hidden' })

      const response = await get('/vis_note', asPublic, { depth: '1' })

      expect(JSON.stringify(response.body)).not.toContain('code-hidden')
    })

    it('is expanded for an editor', async () => {
      await seed('hidden', {}, 'private')
      await seed('host', { main: 'hidden', related: ['hidden'] })

      const entry = dataOf(await get('/vis_note/host', asEditor, { depth: '1' }))
      const main = valuesOf(entry)['main'] as Record<string, unknown>
      const related = valuesOf(entry)['related'] as Record<string, unknown>[]

      expect(valuesOf(main)['secretCode']).toBe('code-hidden')
      expect(valuesOf(related[0] ?? {})['secretCode']).toBe('code-hidden')
    })

    it('is expanded for the entries of a cycle that includes it, for an editor only', async () => {
      await seed('hidden', {}, 'private')
      await seed('host', { main: 'hidden' })
      await harness.store(NOTE).update('hidden', { values: { main: 'host' } })
      await harness.store(NOTE).publish('hidden')

      const anonymous = await get('/vis_note/host', asPublic, { depth: '3' })
      expect(JSON.stringify(anonymous.body)).not.toContain('code-hidden')

      const editor = await get('/vis_note/host', asEditor, { depth: '3' })
      expect(JSON.stringify(editor.body)).toContain('code-hidden')
    })
  })

  describe('history and translations of a restricted entry', () => {
    it('are not readable by someone who may read drafts but not edit the collection', async () => {
      await seed('locked', {}, 'password')

      for (const route of ['/vis_note/locked/history', '/vis_note/locked/translations']) {
        const response = await get(route, asViewer)
        expect(JSON.stringify(response.body)).not.toContain('vault-locked')
        expect(JSON.stringify(response.body)).not.toContain('code-locked')
      }
    })
  })
})
