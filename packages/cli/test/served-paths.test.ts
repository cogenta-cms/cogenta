import { defineCollection, f } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { createServedPathResolver } from '../src/commands/served-paths.js'

const posts = defineCollection({
  name: 'post',
  labels: { singular: 'Post', plural: 'Posts' },
  fields: { title: f.text({ required: true }) },
  permissions: {
    read: ['public'],
    create: ['admin'],
    update: ['admin'],
    delete: ['admin'],
    publish: ['admin'],
  },
})

function resolver() {
  return createServedPathResolver({
    collections: [posts],
    resolveTermArchive: async (taxonomy, slug) =>
      taxonomy === 'sector' && slug === 'energy' ? { found: true } : null,
    resolveAuthorArchive: async (slug) => (slug === 'ada' ? { found: true } : null),
  })
}

describe('createServedPathResolver', () => {
  it('serves a term archive that exists and refuses one that does not', async () => {
    const served = resolver()
    expect(await served('/sector/energy')).toBe(true)
    expect(await served('/sector/unknown')).toBe(false)
    expect(await served('/nothing/energy')).toBe(false)
  })

  it('serves the search page, the home and an existing author archive', async () => {
    const served = resolver()
    expect(await served('/search')).toBe(true)
    expect(await served('/')).toBe(true)
    expect(await served('/archive/author/ada')).toBe(true)
    expect(await served('/archive/author/nobody')).toBe(false)
  })

  it('serves a date archive only for a collection the site has', async () => {
    const served = resolver()
    expect(await served('/archive/post/2026')).toBe(true)
    expect(await served('/archive/post/2026/10')).toBe(true)
    expect(await served('/archive/ghost/2026')).toBe(false)
  })

  it('ignores a trailing slash and a malformed escape', async () => {
    const served = resolver()
    expect(await served('/sector/energy/')).toBe(true)
    expect(await served('/sector/%E0%A4%A')).toBe(false)
  })
})
