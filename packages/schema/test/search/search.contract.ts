import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { newId } from '../../src/id.js'
import { searchDocumentFor } from '../../src/search/extract.js'
import type { SearchDocument, SearchDriver } from '../../src/search/types.js'
import type { ContentEntry } from '../../src/store/types.js'
import type { CollectionDefinition } from '../../src/types.js'

export interface SearchHarness {
  readonly db: DatabaseHandle
  readonly index: SearchDriver
  dispose?(): Promise<void>
}

/**
 * The single contract suite for `SearchDriver`.
 *
 * Written once and run five times: SQLite with FTS5 and SQLite without it as
 * unit tests, Postgres, MySQL and MariaDB as integration tests. The L1 spec
 * accepts unequal *ranking* between the three engines, so nothing here asserts
 * an order between two matches. What it does assert is everything a caller is
 * entitled to rely on: the document that contains the words is found, accents
 * and case never decide the answer, and a draft or another language is never
 * returned to someone who did not ask for it — that last one is not a quality
 * question but a permission one, and it has the same answer on every dialect.
 *
 * The vocabulary is chosen with two server-side floors in mind: MySQL does not
 * index words shorter than three characters, and InnoDB's default stopword list
 * swallows `de`, `la`, `en` and `the`. Terms in this file are long enough and
 * are none of those.
 */

const ARTICLES = 'search_article'
const PAGES = 'search_page'

interface Seed {
  readonly key: string
  readonly document: SearchDocument
}

function seedDocuments(): Seed[] {
  return [
    {
      key: 'fr-published',
      document: {
        id: newId(),
        collection: ARTICLES,
        locale: 'fr',
        status: 'published',
        title: 'Cathédrale de Reims',
        body: 'Une visite guidée du chantier gothique, avec photographies.',
      },
    },
    {
      key: 'fr-draft',
      document: {
        id: newId(),
        collection: ARTICLES,
        locale: 'fr',
        status: 'draft',
        title: 'Brouillon confidentiel',
        body: 'Cathédrale fermée, chantier interrompu.',
      },
    },
    {
      key: 'en-published',
      document: {
        id: newId(),
        collection: ARTICLES,
        locale: 'en',
        status: 'published',
        title: 'Reims Cathedral',
        body: 'A guided tour around the gothic building.',
      },
    },
    {
      key: 'fr-page',
      document: {
        id: newId(),
        collection: PAGES,
        locale: 'fr',
        status: 'published',
        title: 'Mentions légales',
        body: 'Hébergement et responsabilité éditoriale.',
      },
    },
  ]
}

/** A collection and an entry, so one test can prove what actually gets indexed. */
const vitrailCollection: CollectionDefinition = {
  name: ARTICLES,
  labels: { singular: 'Article', plural: 'Articles' },
  fields: {
    title: { kind: 'text', options: { max: 200 } },
    body: { kind: 'richText', options: {} },
    zone: { kind: 'blocks', options: { allow: '*' } },
  },
  permissions: { read: ['public'] },
}

function vitrailEntry(id: string): ContentEntry {
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: null,
    updatedBy: null,
    status: 'published',
    deletedAt: null,
    reviewState: 'none',
    assignedReviewer: null,
    locale: 'fr',
    translationOf: null,
    version: 1,
    provenance: 'human',
    provenanceDetail: null,
    publishedAt: null,
    state: 'published',
    values: {
      title: 'Restauration',
      body: [
        {
          _key: 'b1',
          _type: 'block',
          style: 'normal',
          children: [{ _key: 's1', _type: 'span', text: 'Le vitrail restauré brille.', marks: [] }],
          markDefs: [],
        },
      ],
    },
    blocks: { zone: [{ key: 'k1', type: 'quote', data: { text: 'Patrimoine mondial' } }] },
  }
}

export function runSearchContract(
  name: string,
  create: () => Promise<SearchHarness> | SearchHarness,
): void {
  describe(`SearchDriver contract — ${name}`, () => {
    let harness: SearchHarness
    let index: SearchDriver
    let seeds: Seed[]

    const idOf = (key: string): string => {
      const found = seeds.find((seed) => seed.key === key)
      if (found === undefined) throw new Error(`no seed named ${key}`)
      return found.document.id
    }

    const idsOf = async (query: Parameters<SearchDriver['search']>[0]): Promise<Set<string>> => {
      const results = await index.search(query)
      return new Set(results.hits.map((hit) => hit.id))
    }

    beforeEach(async () => {
      harness = await create()
      index = harness.index
      await index.clear()

      seeds = seedDocuments()
      for (const seed of seeds) await index.index(seed.document)
    })

    afterEach(async () => {
      await index.clear()
      await harness.dispose?.()
    })

    describe('finding what was indexed', () => {
      it('finds the entry whose text contains the word', async () => {
        expect(await idsOf({ text: 'photographies', locale: 'fr' })).toEqual(
          new Set([idOf('fr-published')]),
        )
      })

      it('finds an entry by a word from its title', async () => {
        expect(await idsOf({ text: 'cathedrale', locale: 'fr' })).toEqual(
          new Set([idOf('fr-published')]),
        )
      })

      it('returns nothing for a word no entry contains', async () => {
        const results = await index.search({ text: 'submersible', locale: 'fr' })

        expect(results.hits).toEqual([])
        expect(results.hasMore).toBe(false)
        expect(results.nextOffset).toBeNull()
      })

      it('requires every word of the query, not just one of them', async () => {
        expect(await idsOf({ text: 'visite gothique', locale: 'fr' })).toEqual(
          new Set([idOf('fr-published')]),
        )
        expect(await idsOf({ text: 'visite hébergement', locale: 'fr' })).toEqual(new Set())
      })

      it('matches a word the reader has only half typed', async () => {
        expect(await idsOf({ text: 'cathedr', locale: 'fr' })).toEqual(
          new Set([idOf('fr-published')]),
        )
      })

      it('returns the stored title with the hit', async () => {
        const results = await index.search({ text: 'photographies', locale: 'fr' })

        expect(results.hits[0]?.title).toBe('Cathédrale de Reims')
        expect(results.hits[0]?.collection).toBe(ARTICLES)
        expect(results.hits[0]?.locale).toBe('fr')
        expect(results.hits[0]?.status).toBe('published')
        expect(results.hits[0]?.score).toBeTypeOf('number')
      })

      it('answers an empty query with no hits rather than an error', async () => {
        const results = await index.search({ text: '   ', locale: 'fr' })

        expect(results.hits).toEqual([])
      })
    })

    describe('accents and case', () => {
      it('finds an accented word typed without its accents', async () => {
        expect(await idsOf({ text: 'guidee', locale: 'fr' })).toEqual(
          new Set([idOf('fr-published')]),
        )
      })

      it('finds an accented word typed with its accents', async () => {
        expect(await idsOf({ text: 'guidée', locale: 'fr' })).toEqual(
          new Set([idOf('fr-published')]),
        )
      })

      it('ignores case, including on accented letters', async () => {
        expect(await idsOf({ text: 'CATHÉDRALE', locale: 'fr' })).toEqual(
          new Set([idOf('fr-published')]),
        )
      })
    })

    describe('what a reader is allowed to see', () => {
      it('never returns a draft to a search that did not ask for one', async () => {
        // The draft contains "Cathédrale" too. This is the test the whole
        // feature is judged on: a public search box must not leak it.
        expect(await idsOf({ text: 'cathedrale', locale: 'fr' })).not.toContain(idOf('fr-draft'))
      })

      it('never returns a draft on any term it alone contains', async () => {
        expect(await idsOf({ text: 'interrompu', locale: 'fr' })).toEqual(new Set())
      })

      it('returns a draft only to a search that names that state', async () => {
        expect(await idsOf({ text: 'interrompu', locale: 'fr', status: 'draft' })).toEqual(
          new Set([idOf('fr-draft')]),
        )
      })

      it('never crosses a locale', async () => {
        expect(await idsOf({ text: 'reims', locale: 'fr' })).toEqual(
          new Set([idOf('fr-published')]),
        )
        expect(await idsOf({ text: 'reims', locale: 'en' })).toEqual(
          new Set([idOf('en-published')]),
        )
      })

      it('refuses a search with no locale rather than searching them all', async () => {
        // There is deliberately no "search every language" value: a caller who
        // does not know which locale to ask for does not know which content the
        // reader may see either.
        await expect(index.search({ text: 'reims', locale: '' })).rejects.toThrowError()
      })

      it('restricts to the collections it was given', async () => {
        expect(await idsOf({ text: 'mentions', locale: 'fr', collections: [ARTICLES] })).toEqual(
          new Set(),
        )
        expect(await idsOf({ text: 'mentions', locale: 'fr', collections: [PAGES] })).toEqual(
          new Set([idOf('fr-page')]),
        )
      })

      it('searches every collection when none is named', async () => {
        expect(await idsOf({ text: 'mentions', locale: 'fr' })).toEqual(new Set([idOf('fr-page')]))
      })
    })

    describe('keeping the index in step with the content', () => {
      it('stops returning an entry that was removed', async () => {
        await index.remove({ id: idOf('fr-published'), collection: ARTICLES })

        expect(await idsOf({ text: 'photographies', locale: 'fr' })).toEqual(new Set())
      })

      it('is silent about removing something that was never indexed', async () => {
        await expect(index.remove({ id: newId(), collection: ARTICLES })).resolves.toBeUndefined()
      })

      it('replaces an entry rather than duplicating it when it is indexed again', async () => {
        const id = idOf('fr-published')
        await index.index({
          id,
          collection: ARTICLES,
          locale: 'fr',
          status: 'published',
          title: 'Cathédrale de Reims',
          body: 'Le chantier est terminé, sculptures nettoyées.',
        })

        const results = await index.search({ text: 'sculptures', locale: 'fr' })
        expect(results.hits.map((hit) => hit.id)).toEqual([id])
        expect(await idsOf({ text: 'photographies', locale: 'fr' })).toEqual(new Set())
      })

      it('follows an entry that changed state', async () => {
        const id = idOf('fr-draft')
        await index.index({
          id,
          collection: ARTICLES,
          locale: 'fr',
          status: 'published',
          title: 'Brouillon confidentiel',
          body: 'Cathédrale fermée, chantier interrompu.',
        })

        expect(await idsOf({ text: 'interrompu', locale: 'fr' })).toEqual(new Set([id]))
      })

      it('keeps two collections that share an entry identifier apart', async () => {
        const id = newId()
        await index.index({
          id,
          collection: ARTICLES,
          locale: 'fr',
          status: 'published',
          title: 'Article',
          body: 'Charpente ancienne.',
        })
        await index.index({
          id,
          collection: PAGES,
          locale: 'fr',
          status: 'published',
          title: 'Page',
          body: 'Charpente ancienne.',
        })

        const results = await index.search({ text: 'charpente', locale: 'fr' })
        expect(results.hits.map((hit) => hit.collection).sort()).toEqual([ARTICLES, PAGES])
      })

      it('empties one collection without touching the others', async () => {
        await index.clear({ collection: ARTICLES })

        expect(await idsOf({ text: 'photographies', locale: 'fr' })).toEqual(new Set())
        expect(await idsOf({ text: 'mentions', locale: 'fr' })).toEqual(new Set([idOf('fr-page')]))
      })

      it('empties everything and stays usable afterwards', async () => {
        await index.clear()
        expect(await idsOf({ text: 'mentions', locale: 'fr' })).toEqual(new Set())

        const id = newId()
        await index.index({
          id,
          collection: PAGES,
          locale: 'fr',
          status: 'published',
          title: 'Nouvelle',
          body: 'Charpente ancienne.',
        })
        expect(await idsOf({ text: 'charpente', locale: 'fr' })).toEqual(new Set([id]))
      })
    })

    describe('what gets indexed', () => {
      it('finds an entry by the words of its rich text and of its blocks', async () => {
        const id = newId()
        await index.index(searchDocumentFor(vitrailCollection, vitrailEntry(id)))

        expect(await idsOf({ text: 'vitrail', locale: 'fr' })).toEqual(new Set([id]))
        expect(await idsOf({ text: 'patrimoine', locale: 'fr' })).toEqual(new Set([id]))
      })

      it('does not make the storage format itself searchable', async () => {
        const id = newId()
        await index.index(searchDocumentFor(vitrailCollection, vitrailEntry(id)))

        // These are keys of the rich text document, not words an editor wrote.
        // Their presence would mean the raw JSON had been indexed.
        expect(await idsOf({ text: 'markDefs', locale: 'fr' })).toEqual(new Set())
        expect(await idsOf({ text: 'span', locale: 'fr' })).toEqual(new Set())
      })
    })

    describe('pagination', () => {
      const pageSeeds = 5

      beforeEach(async () => {
        await index.clear()
        for (let position = 0; position < pageSeeds; position += 1) {
          await index.index({
            id: newId(),
            collection: PAGES,
            locale: 'fr',
            status: 'published',
            title: `Charpente ${position}`,
            body: 'Charpente ancienne restaurée.',
          })
        }
      })

      it('hands back only the page that was asked for', async () => {
        const results = await index.search({ text: 'charpente', locale: 'fr', limit: 2 })

        expect(results.hits).toHaveLength(2)
        expect(results.hasMore).toBe(true)
        expect(results.nextOffset).toBe(2)
      })

      it('walks the whole result set without repeating or losing a hit', async () => {
        const seen = new Set<string>()
        let offset: number | null = 0

        while (offset !== null) {
          const page: Awaited<ReturnType<SearchDriver['search']>> = await index.search({
            text: 'charpente',
            locale: 'fr',
            limit: 2,
            offset,
          })
          for (const hit of page.hits) seen.add(hit.id)
          offset = page.nextOffset
        }

        expect(seen.size).toBe(pageSeeds)
      })

      it('says there is no next page on the last one', async () => {
        const results = await index.search({
          text: 'charpente',
          locale: 'fr',
          limit: 2,
          offset: 4,
        })

        expect(results.hits).toHaveLength(1)
        expect(results.hasMore).toBe(false)
        expect(results.nextOffset).toBeNull()
      })

      it('refuses a negative limit or offset', async () => {
        await expect(
          index.search({ text: 'charpente', locale: 'fr', limit: -1 }),
        ).rejects.toThrowError()
        await expect(
          index.search({ text: 'charpente', locale: 'fr', offset: -1 }),
        ).rejects.toThrowError()
      })
    })

    describe('health', () => {
      it('reports which engine is running, and never as down', async () => {
        const report = await index.health()

        expect(report.status).not.toBe('down')
        expect(report.driver.length).toBeGreaterThan(0)
        expect(report.message ?? '').not.toBe('')
      })
    })
  })
}
