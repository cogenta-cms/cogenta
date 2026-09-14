import { defineCollection, f } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { entryFieldValues } from '../src/commands/theme-render.js'

/**
 * Contract D `theme@1.5`: a product page has to be able to print its price and
 * whether it is in stock, and a dish its price. `PageEntryMeta.fields` carries
 * an entry's plain values to the theme, and nothing a theme could not print as
 * it is.
 */
const product = defineCollection({
  name: 'product',
  labels: { singular: 'Product', plural: 'Products' },
  routing: { pattern: '/shop/:slug' },
  fields: {
    name: f.text({ required: true, max: 120 }),
    slug: f.slug({ from: 'name', unique: true }),
    price: f.number({ required: true, min: 0 }),
    inStock: f.boolean(),
    category: f.select({ options: ['home', 'outdoor'], required: true }),
    launched: f.date(),
    description: f.richText(),
    photo: f.media({ accept: ['image'] }),
  },
  indexes: [['slug']],
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
})

describe('entryFieldValues', () => {
  it('passes the plain values a product page prints: text, number, boolean, select, date', () => {
    const fields = entryFieldValues(
      {
        values: {
          name: 'Enamel mug',
          slug: 'enamel-mug',
          price: 18,
          inStock: false,
          category: 'home',
          launched: '2026-03-01',
        },
      },
      product,
    )
    expect(fields).toEqual({
      name: 'Enamel mug',
      slug: 'enamel-mug',
      price: 18,
      inStock: false,
      category: 'home',
      launched: '2026-03-01',
    })
  })

  it('never passes rich text, media or anything a theme could not print as it is', () => {
    const fields = entryFieldValues(
      {
        values: {
          name: 'Enamel mug',
          price: 18,
          description: [{ _type: 'block', _key: 'a', children: [] }],
          photo: 'media-id',
        },
      },
      product,
    )
    expect(fields).toEqual({ name: 'Enamel mug', price: 18 })
  })

  it('leaves out unset values and returns nothing for an entry with no plain value', () => {
    expect(entryFieldValues({ values: { inStock: null, price: Number.NaN } }, product)).toBe(
      undefined,
    )
  })
})
