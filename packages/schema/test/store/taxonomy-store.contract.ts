import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineCollection } from '../../src/define-collection.js'
import { defineTaxonomy } from '../../src/define-taxonomy.js'
import { f } from '../../src/fields.js'
import type { ContentStore } from '../../src/store/store.js'
import { createContentStore } from '../../src/store/store.js'
import { createSchemaTables, dropSchemaTables } from '../../src/store/tables.js'
import type { TaxonomyStore } from '../../src/store/taxonomy-store.js'
import { createTaxonomyStore } from '../../src/store/taxonomy-store.js'

export interface TaxonomyHarness {
  readonly db: DatabaseHandle
  dispose?(): Promise<void>
}

/**
 * The single contract suite for taxonomies (`schema@2.0`, ADR-0022).
 *
 * Written once, run four times — SQLite as a unit test, Postgres, MySQL and
 * MariaDB as integration tests. The materialised path is the reason this
 * matters more than usual: its whole justification is that a `like` on a path
 * behaves identically on the three dialects where a recursive CTE would not
 * (ADR-0006), and a claim like that is worth nothing until it is run on all
 * three.
 */

const category = defineTaxonomy({
  name: 'tx_category',
  labels: { singular: { fr: 'Catégorie', en: 'Category' } },
  hierarchical: true,
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
})

/** A flat taxonomy, to prove nesting is refused rather than quietly stored. */
const keyword = defineTaxonomy({
  name: 'tx_keyword',
  labels: { singular: { en: 'Keyword' } },
  hierarchical: false,
  permissions: { read: ['public'], create: ['editor'] },
})

const recipe = defineCollection({
  name: 'tx_recipe',
  labels: { singular: 'Recipe', plural: 'Recipes' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    categories: f.taxonomy({ of: 'tx_category', many: true }),
    // Single-valued, which is the exception a taxonomy field has to spell out.
    keywords: f.taxonomy({ of: 'tx_keyword', many: false }),
  },
  permissions: { read: ['public'], create: ['editor'] },
})

/** The reuse a taxonomy exists for: the same term, on a second collection. */
const post = defineCollection({
  name: 'tx_post',
  labels: { singular: 'Post', plural: 'Posts' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    categories: f.taxonomy({ of: 'tx_category', many: true }),
  },
  permissions: { read: ['public'], create: ['editor'] },
})

const collections = [recipe, post]
const taxonomies = [category, keyword]

export function runTaxonomyContract(name: string, create: () => Promise<TaxonomyHarness>): void {
  describe(`Taxonomy contract — ${name}`, () => {
    let harness: TaxonomyHarness
    let db: DatabaseHandle
    let categories: TaxonomyStore
    let keywords: TaxonomyStore
    let recipes: ContentStore
    let posts: ContentStore

    beforeEach(async () => {
      harness = await create()
      db = harness.db

      await dropSchemaTables(db, collections, taxonomies)
      await createSchemaTables(db, collections, taxonomies)

      categories = createTaxonomyStore({ db, taxonomy: category })
      keywords = createTaxonomyStore({ db, taxonomy: keyword })
      recipes = createContentStore({ db, collection: recipe, siblings: collections })
      posts = createContentStore({ db, collection: post, siblings: collections })
    })

    afterEach(async () => {
      await dropSchemaTables(db, collections, taxonomies)
      await db.close()
      await harness.dispose?.()
    })

    describe('terms', () => {
      it('stores a term with labels indexed by locale, and no content lifecycle', async () => {
        const term = await categories.create({
          slug: 'cuisine',
          labels: { fr: 'Cuisine', en: 'Cooking' },
        })

        // "Cuisine" and "Cooking" are one concept of classification, not two
        // contents in a translation family (ADR-0022 vs ADR-0014).
        expect(term.labels).toEqual({ fr: 'Cuisine', en: 'Cooking' })
        expect(term.parent).toBeNull()
        expect(term.depth).toBe(0)
        expect(Object.keys(term)).not.toContain('status')
        expect(Object.keys(term)).not.toContain('version')
        expect(Object.keys(term)).not.toContain('translationOf')
      })

      it('refuses two terms answering to the same slug', async () => {
        await categories.create({ slug: 'cuisine', labels: { fr: 'Cuisine' } })

        await expect(
          categories.create({ slug: 'cuisine', labels: { fr: 'Autre' } }),
        ).rejects.toMatchObject({ code: 'TAXONOMY_SLUG_TAKEN' })
      })

      it('finds a term by the slug a URL would carry', async () => {
        const term = await categories.create({ slug: 'cuisine', labels: { fr: 'Cuisine' } })

        expect((await categories.bySlug('cuisine'))?.id).toBe(term.id)
        expect(await categories.bySlug('nope')).toBeNull()
      })

      it('refuses to nest a term of a flat taxonomy', async () => {
        const root = await keywords.create({ slug: 'vegan', labels: { en: 'Vegan' } })

        await expect(
          keywords.create({ slug: 'raw', labels: { en: 'Raw' }, parent: root.id }),
        ).rejects.toMatchObject({ code: 'TAXONOMY_NOT_HIERARCHICAL' })
      })
    })

    describe('the tree, stored as a materialised path', () => {
      it('builds a path from the root down, so depth is derived not declared', async () => {
        const root = await categories.create({ slug: 'cuisine', labels: { fr: 'Cuisine' } })
        const child = await categories.create({
          slug: 'desserts',
          labels: { fr: 'Desserts' },
          parent: root.id,
        })
        const grandChild = await categories.create({
          slug: 'tartes',
          labels: { fr: 'Tartes' },
          parent: child.id,
        })

        expect(root.path).toBe(`/${root.id}/`)
        expect(child.path).toBe(`/${root.id}/${child.id}/`)
        expect(grandChild.depth).toBe(2)
      })

      it('answers "everything under this term" with one query', async () => {
        const root = await categories.create({ slug: 'cuisine', labels: { fr: 'Cuisine' } })
        const child = await categories.create({
          slug: 'desserts',
          labels: { fr: 'Desserts' },
          parent: root.id,
        })
        const grandChild = await categories.create({
          slug: 'tartes',
          labels: { fr: 'Tartes' },
          parent: child.id,
        })
        const unrelated = await categories.create({ slug: 'voyage', labels: { fr: 'Voyage' } })

        const subtree = await categories.subtree(root.id)
        const ids = subtree.map((term) => term.id)

        expect(ids).toEqual([root.id, child.id, grandChild.id])
        expect(ids).not.toContain(unrelated.id)
      })

      it('never mistakes a sibling with a longer slug for a child', async () => {
        // The slashes around each segment are what make this true: without
        // them a prefix match on ids would let one term shadow another.
        const first = await categories.create({ slug: 'a', labels: { fr: 'A' } })
        const second = await categories.create({ slug: 'ab', labels: { fr: 'AB' } })

        expect((await categories.subtree(first.id)).map((term) => term.id)).toEqual([first.id])
        expect((await categories.subtree(second.id)).map((term) => term.id)).toEqual([second.id])
      })

      it('gives the ancestry from the root down, for a breadcrumb', async () => {
        const root = await categories.create({ slug: 'cuisine', labels: { fr: 'Cuisine' } })
        const child = await categories.create({
          slug: 'desserts',
          labels: { fr: 'Desserts' },
          parent: root.id,
        })

        expect((await categories.ancestors(child.id)).map((term) => term.slug)).toEqual([
          'cuisine',
          'desserts',
        ])
      })

      it('rewrites the whole subtree when a branch is moved', async () => {
        const cuisine = await categories.create({ slug: 'cuisine', labels: { fr: 'Cuisine' } })
        const voyage = await categories.create({ slug: 'voyage', labels: { fr: 'Voyage' } })
        const desserts = await categories.create({
          slug: 'desserts',
          labels: { fr: 'Desserts' },
          parent: cuisine.id,
        })
        const tartes = await categories.create({
          slug: 'tartes',
          labels: { fr: 'Tartes' },
          parent: desserts.id,
        })

        await categories.move(desserts.id, voyage.id)

        const moved = await categories.read(desserts.id)
        const movedChild = await categories.read(tartes.id)

        expect(moved?.path).toBe(`/${voyage.id}/${desserts.id}/`)
        // The grandchild moved with its parent — this is the write-side cost a
        // materialised path pays so that every read stays a single `like`.
        expect(movedChild?.path).toBe(`/${voyage.id}/${desserts.id}/${tartes.id}/`)
        expect(movedChild?.depth).toBe(2)
        expect((await categories.subtree(cuisine.id)).map((term) => term.id)).toEqual([cuisine.id])
      })

      it('refuses a move that would make a term its own ancestor', async () => {
        const root = await categories.create({ slug: 'cuisine', labels: { fr: 'Cuisine' } })
        const child = await categories.create({
          slug: 'desserts',
          labels: { fr: 'Desserts' },
          parent: root.id,
        })

        await expect(categories.move(root.id, child.id)).rejects.toMatchObject({
          code: 'TAXONOMY_CYCLE',
        })
        // Nothing was half-written by the refusal.
        expect((await categories.read(root.id))?.path).toBe(`/${root.id}/`)
      })

      it('rewrites no path at all when a term is merely renamed', async () => {
        const root = await categories.create({ slug: 'cuisine', labels: { fr: 'Cuisine' } })
        const child = await categories.create({
          slug: 'desserts',
          labels: { fr: 'Desserts' },
          parent: root.id,
        })

        await categories.update(root.id, { slug: 'gastronomie', labels: { fr: 'Gastronomie' } })

        // Paths are built from ids precisely so that a rename is one row.
        expect((await categories.read(child.id))?.path).toBe(`/${root.id}/${child.id}/`)
        expect((await categories.read(root.id))?.slug).toBe('gastronomie')
      })

      it('lists the roots, the children of one term, and the whole tree in order', async () => {
        const cuisine = await categories.create({ slug: 'cuisine', labels: { fr: 'Cuisine' } })
        const voyage = await categories.create({ slug: 'voyage', labels: { fr: 'Voyage' } })
        const desserts = await categories.create({
          slug: 'desserts',
          labels: { fr: 'Desserts' },
          parent: cuisine.id,
        })

        expect((await categories.list({ parent: null })).map((term) => term.id).sort()).toEqual(
          [cuisine.id, voyage.id].sort(),
        )
        expect((await categories.list({ parent: cuisine.id })).map((term) => term.id)).toEqual([
          desserts.id,
        ])
        expect(await categories.list()).toHaveLength(3)
      })

      it('refuses to delete a term that still has children, unless cascade is asked for', async () => {
        const root = await categories.create({ slug: 'cuisine', labels: { fr: 'Cuisine' } })
        const child = await categories.create({
          slug: 'desserts',
          labels: { fr: 'Desserts' },
          parent: root.id,
        })

        await expect(categories.delete(root.id)).rejects.toMatchObject({
          code: 'TAXONOMY_TERM_HAS_CHILDREN',
        })
        expect(await categories.read(child.id)).not.toBeNull()

        expect(await categories.delete(root.id, { cascade: true })).toBe(true)
        expect(await categories.read(child.id)).toBeNull()
      })
    })

    describe('the taxonomy field on a collection', () => {
      it('classifies an entry with several terms, in the order chosen', async () => {
        const cuisine = await categories.create({ slug: 'cuisine', labels: { fr: 'Cuisine' } })
        const desserts = await categories.create({ slug: 'desserts', labels: { fr: 'Desserts' } })

        const entry = await recipes.create({
          values: { title: 'Tarte Tatin', categories: [desserts.id, cuisine.id] },
        })

        const read = await recipes.read(entry.id, { state: 'working' })
        expect(read?.values['categories']).toEqual([desserts.id, cuisine.id])
      })

      it('reuses the very same term across two collections', async () => {
        const cuisine = await categories.create({ slug: 'cuisine', labels: { fr: 'Cuisine' } })

        const dish = await recipes.create({
          values: { title: 'Tarte Tatin', categories: [cuisine.id] },
        })
        const article = await posts.create({
          values: { title: 'Le goût du sucre', categories: [cuisine.id] },
        })

        // The whole reason a taxonomy is not a collection: one term, two
        // collections, no duplication.
        expect((await recipes.read(dish.id, { state: 'working' }))?.values['categories']).toEqual([
          cuisine.id,
        ])
        expect((await posts.read(article.id, { state: 'working' }))?.values['categories']).toEqual([
          cuisine.id,
        ])
      })

      it('un-classifies content when a term is deleted, never deletes the content', async () => {
        const cuisine = await categories.create({ slug: 'cuisine', labels: { fr: 'Cuisine' } })
        const entry = await recipes.create({
          values: { title: 'Tarte Tatin', categories: [cuisine.id] },
        })

        await categories.delete(cuisine.id)

        const read = await recipes.read(entry.id, { state: 'working' })
        expect(read).not.toBeNull()
        expect(read?.values['categories']).toEqual([])
      })

      it('holds a single term in a column when the field is not many', async () => {
        const vegan = await keywords.create({ slug: 'vegan', labels: { en: 'Vegan' } })
        const entry = await recipes.create({
          values: { title: 'Soupe', keywords: vegan.id },
        })

        expect((await recipes.read(entry.id, { state: 'working' }))?.values['keywords']).toBe(
          vegan.id,
        )
      })
    })
  })
}
