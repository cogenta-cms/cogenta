import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VocabularyBlock } from '@cogenta/blocks'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { buildPath, createContentStore, createSchemaTables, matchPath } from '@cogenta/schema'
import {
  type HtmlNode,
  type PageContent,
  type RenderContext,
  renderPage,
  serialize,
} from '@cogenta/theme-canonical'
import { afterEach, describe, expect, it } from 'vitest'
import { PROJECT_SITE_PAGES, page } from '../src/content.js'

function htmlOf(node: HtmlNode | null): string {
  if (node === null) throw new Error('renderPage returned null')
  return serialize(node)
}

const ctx: RenderContext = {
  site: { name: 'Cogenta', url: 'https://cogenta.example', locales: ['fr'], defaultLocale: 'fr' },
  locale: 'fr',
  url: new URL('https://cogenta.example/home'),
  t: (key) => key,
  image: () => {
    throw new Error('not used by this test')
  },
  link: (target) => (typeof target === 'string' ? target : 'path' in target ? target.path : ''),
  content: {
    entry: async () => null,
    byPath: async () => null,
    list: async () => ({ items: [], nextCursor: null }),
  },
}

describe('the project site', () => {
  const dirs: string[] = []
  let db: DatabaseHandle | undefined

  afterEach(async () => {
    await db?.close()
    db = undefined
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function seed(): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), 'cogenta-project-site-'))
    dirs.push(directory)
    db = await createSqliteHandle({ url: join(directory, 'site.db') })
    await createSchemaTables(db, [page])

    const store = createContentStore({ db, collection: page })
    for (const demo of PROJECT_SITE_PAGES) {
      await store.create({
        status: 'published',
        values: { title: demo.title, slug: demo.slug },
        blocks: {
          blocks: demo.blocks.map((block) => {
            const { _key, _type, _version: _discard, ...data } = block
            return { key: _key, type: _type, data }
          }),
        },
      })
    }
  }

  it('has four real pages: home, blueprints, docs, playground', () => {
    expect(PROJECT_SITE_PAGES.map((p) => p.slug).sort()).toEqual([
      'blueprints',
      'docs',
      'home',
      'playground',
    ])
  })

  it('renders every seeded page into real HTML through the real theme-canonical pipeline', async () => {
    await seed()
    if (db === undefined) throw new Error('unreachable')
    const store = createContentStore({ db, collection: page })
    const all = await store.list({ state: 'published' })

    for (const entry of all.items) {
      const content: PageContent = {
        title: entry.values.title as string,
        blocks: (entry.blocks.blocks ?? []).map(
          (block): VocabularyBlock =>
            ({
              _key: block.key,
              _type: block.type,
              _version: '1.0.0',
              ...block.data,
            }) as VocabularyBlock,
        ),
      }
      const html = htmlOf(renderPage(content, ctx, {}))
      expect(html.length).toBeGreaterThan(0)
    }
  })

  it('the home page renders the real vision statement, not placeholder text', async () => {
    await seed()
    if (db === undefined) throw new Error('unreachable')
    const store = createContentStore({ db, collection: page })
    const home = (await store.list({ state: 'published' })).items.find(
      (entry) => entry.values.slug === 'home',
    )
    expect(home).toBeDefined()
    if (home === undefined) throw new Error('unreachable')

    const content: PageContent = {
      title: home.values.title as string,
      blocks: (home.blocks.blocks ?? []).map(
        (block): VocabularyBlock =>
          ({
            _key: block.key,
            _type: block.type,
            _version: '1.0.0',
            ...block.data,
          }) as VocabularyBlock,
      ),
    }
    const html = htmlOf(renderPage(content, ctx, {}))
    expect(html).toContain('Le premier CMS qui exploite les sites à votre place')
    expect(html).toContain('npm create cogenta')
  })

  it('resolves /:slug generically through @cogenta/schema routing for a real non-home page', () => {
    expect(matchPath([page], '/playground')).toEqual({
      collection: 'page',
      params: { slug: 'playground' },
      locale: null,
    })
    expect(buildPath(page, { slug: 'blueprints' })).toBe('/blueprints')
  })
})
