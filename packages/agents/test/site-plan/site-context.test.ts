import { defineCollection, defineTaxonomy, f } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import {
  describeExistingSite,
  EMPTY_EXISTING_SITE,
  isExistingSiteEmpty,
  renderExistingSiteForPrompt,
} from '../../src/site-plan/site-context.js'

describe('describing an existing site (fiche 60 task 2)', () => {
  it('is honestly empty for a site that declares nothing yet', () => {
    const snapshot = describeExistingSite({ collections: [] })

    expect(snapshot).toEqual(EMPTY_EXISTING_SITE)
    expect(isExistingSiteEmpty(snapshot)).toBe(true)
    expect(renderExistingSiteForPrompt(snapshot)).toContain('brand-new site')
  })

  it('describes a populated site — collections, fields, counts, theme, integrations, taxonomies', () => {
    const dish = defineCollection({
      name: 'dish',
      labels: { singular: 'Dish', plural: 'Dishes' },
      routing: { pattern: '/carte/:slug' },
      fields: {
        title: f.text({ required: true }),
        slug: f.slug({ from: 'title' }),
        price: f.number({ min: 0 }),
      },
      permissions: { read: ['public'] },
    })
    const page = defineCollection({
      name: 'contact',
      labels: { singular: 'Contact message', plural: 'Contact messages' },
      fields: { email: f.text({ required: true }) },
      permissions: { read: ['admin'] },
    })
    const cuisine = defineTaxonomy({
      name: 'cuisine',
      labels: { singular: { en: 'Cuisine' }, plural: { en: 'Cuisines' } },
      permissions: { read: ['public'] },
    })

    const snapshot = describeExistingSite({
      collections: [dish, page],
      taxonomies: [cuisine],
      entryCounts: {
        dish: { total: 12, published: 9 },
        // `contact` is deliberately missing: treated as zero, not thrown.
      },
      termCounts: { cuisine: 4 },
      activeTheme: '@cogenta/theme-canonical',
      integrations: ['llm', 'webhooks'],
    })

    expect(isExistingSiteEmpty(snapshot)).toBe(false)
    expect(snapshot.collections).toEqual([
      {
        name: 'dish',
        labels: { singular: 'Dish', plural: 'Dishes' },
        fields: [
          { name: 'title', kind: 'text' },
          { name: 'slug', kind: 'slug' },
          { name: 'price', kind: 'number' },
        ],
        routed: true,
        entryCount: 12,
        publishedCount: 9,
      },
      {
        name: 'contact',
        labels: { singular: 'Contact message', plural: 'Contact messages' },
        fields: [{ name: 'email', kind: 'text' }],
        routed: false,
        entryCount: 0,
        publishedCount: null,
      },
    ])
    expect(snapshot.taxonomies).toEqual([{ name: 'cuisine', termCount: 4 }])
    expect(snapshot.activeTheme).toBe('@cogenta/theme-canonical')
    expect(snapshot.integrations).toEqual(['llm', 'webhooks'])

    const text = renderExistingSiteForPrompt(snapshot)
    expect(text).toContain('dish')
    expect(text).toContain('9 published of 12 total')
    expect(text).toContain('contact')
    expect(text).toContain('not routed, 0 entries')
    expect(text).toContain('cuisine: 4 term(s)')
    expect(text).toContain('@cogenta/theme-canonical')
    expect(text).toContain('llm, webhooks')
  })
})
