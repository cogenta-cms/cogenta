import { describe, expect, it } from 'vitest'
import { categorySegments, previewPermalink } from '../src/lib/permalink.js'
import type { CollectionSummary } from '../src/schema/types.js'

const field = (name: string, kind: string, options: Record<string, unknown> = {}) => ({
  name,
  kind,
  required: false,
  localized: false,
  unique: false,
  hasCustomValidation: false,
  options,
})

const post = {
  name: 'post',
  labels: { singular: 'Post', plural: 'Posts' },
  permissions: {},
  routing: { pattern: '/blog/:category/:slug' },
  fields: [
    field('slug', 'slug'),
    field('category', 'taxonomy', { of: 'topic', many: false }),
    field('tags', 'taxonomy', { of: 'tag', many: true }),
  ],
} as unknown as CollectionSummary

describe('previewPermalink with a category segment', () => {
  it('names the term slug between the prefix and the slug', () => {
    expect(previewPermalink(post, { category: 'devops', slug: 'hello' })).toBe('/blog/devops/hello')
  })

  it('leaves the segment out while the entry has no category', () => {
    expect(previewPermalink(post, { slug: 'hello' })).toBe('/blog/hello')
  })

  it('still waits for the slug', () => {
    expect(previewPermalink(post, { category: 'devops' })).toBeNull()
  })

  it('reports only single-valued taxonomy fields of the route as category segments', () => {
    expect(categorySegments(post)).toEqual([{ param: 'category', taxonomy: 'topic' }])
  })
})
