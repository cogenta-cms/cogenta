import type { DatabaseHandle } from '@cogenta/core'
import { createContentStore, createSchemaTables, dropSchemaTables } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { blogContentPack } from '../src/blueprints/blog.js'
import { createVitrineContentPack } from '../src/blueprints/vitrine.js'

/** Dedicated ephemeral databases only: seeding uses the packs' real table names. */
export function runSeoSeedingContract(label: string, connect: () => Promise<DatabaseHandle>): void {
  describe(`authored home SEO survives real seeding (${label})`, () => {
    for (const [name, locale, pack] of [
      ['blog', 'en', blogContentPack],
      ['vitrine-fr', 'fr', createVitrineContentPack('fr')],
      ['vitrine-en', 'en', createVitrineContentPack('en')],
    ] as const) {
      it(`persists ${name}'s description and allows an author's replacement`, async () => {
        const db = await connect()
        const taxonomies = pack.taxonomies ?? []
        try {
          await dropSchemaTables(db, pack.collections, taxonomies)
          await createSchemaTables(db, pack.collections, taxonomies)
          await pack.seedDemoContent({
            db,
            defaultLocale: locale,
            adminId: null,
            media: {},
            siteName: 'Fieldwork',
          })
          const collection = pack.collections.find((candidate) => candidate.name === 'page')
          expect(collection).toBeDefined()
          if (collection === undefined) return
          const store = createContentStore({ db, collection, defaultLocale: locale })
          const results = await store.list({ where: { slug: 'home' } })
          const home = results.items[0]
          expect(home).toBeDefined()
          if (home === undefined) return
          expect(home.values['seoDescription']).toEqual(expect.stringContaining('Fieldwork'))
          expect(home.locale).toBe(locale)
          expect(home.status).toBe('published')
          await store.update(home.id, {
            values: { seoDescription: 'An authored replacement description.' },
          })
          const edited = await store.read(home.id, { state: 'working' })
          expect(edited?.values['seoDescription']).toBe('An authored replacement description.')
        } finally {
          await dropSchemaTables(db, pack.collections, taxonomies)
          await db.close()
        }
      })
    }
  })
}
