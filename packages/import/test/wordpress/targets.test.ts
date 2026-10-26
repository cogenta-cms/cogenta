import { defineCollection, f } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { blocksToRichText } from '../../src/wordpress/rich-body.js'
import { planWordPressTargets } from '../../src/wordpress/targets.js'

const permissions = { read: ['public'] } as const

/** The shape a site made from a shipped model has: a summary, a rich-text body, a cover image, no category collection. */
const templatePost = defineCollection({
  name: 'post',
  labels: { singular: 'Post', plural: 'Posts' },
  routing: { pattern: '/blog/:slug' },
  fields: {
    title: f.text({ required: true }),
    slug: f.slug({ from: 'title', unique: true }),
    summary: f.text({ multiline: true }),
    author: f.text(),
    publishedAt: f.datetime(),
    coverImage: f.media(),
    body: f.richText(),
    seoTitle: f.text(),
  },
  permissions,
})
const templatePage = defineCollection({
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  routing: { pattern: '/:slug' },
  fields: {
    title: f.text({ required: true }),
    slug: f.slug({ from: 'title', unique: true }),
    blocks: f.blocks({ required: true }),
  },
  permissions,
})

describe('planWordPressTargets', () => {
  it('maps a template site by field kind and conventional name', () => {
    const plan = planWordPressTargets([templatePost, templatePage])
    expect(plan.post).toMatchObject({
      native: false,
      title: 'title',
      slug: 'slug',
      excerpt: 'summary',
      author: 'author',
      publishedAt: 'publishedAt',
      cover: 'coverImage',
      body: { field: 'body', kind: 'richText' },
      customFields: null,
      category: null,
      tags: null,
    })
    expect(plan.page.body).toEqual({ field: 'blocks', kind: 'blocks' })
    expect(plan.category).toBeNull()
    expect(plan.tag).toBeNull()
  })

  it('keeps the importer own model when the site declares neither post nor page', () => {
    const plan = planWordPressTargets([])
    expect(plan.post.native).toBe(true)
    expect(plan.category?.name).toBe('category')
  })

  it('lets the caller pick another collection for posts', () => {
    const article = defineCollection({
      name: 'article',
      labels: { singular: 'Article', plural: 'Articles' },
      fields: { headline: f.text({ required: true }), body: f.richText() },
      permissions,
    })
    const plan = planWordPressTargets([templatePost, article], { post: 'article' })
    expect(plan.post.collection.name).toBe('article')
    expect(plan.post.title).toBe('headline')
    expect(plan.post.slug).toBeNull()
  })

  it('names the collection and why when a chosen one cannot take the import', () => {
    const stuck = defineCollection({
      name: 'post',
      labels: { singular: 'Post', plural: 'Posts' },
      fields: { title: f.text({ required: true }), owner: f.media({ required: true }) },
      permissions,
    })
    expect(() => planWordPressTargets([stuck])).toThrowError(/required media field "owner"/u)
  })

  it('refuses a collection the site does not have', () => {
    expect(() => planWordPressTargets([templatePost], { page: 'nowhere' })).toThrowError(
      /no "nowhere" collection/u,
    )
  })
})

describe('blocksToRichText', () => {
  it('folds prose, images, quotes and embeds into one valid document with unique keys', () => {
    const notes: { source: string; reason: string }[] = []
    const document = blocksToRichText(
      [
        {
          _key: 'a',
          _type: 'prose',
          body: [
            {
              _key: 'p1',
              _type: 'block',
              style: 'normal',
              children: [{ _key: 's1', _type: 'span', text: 'Hello', marks: [] }],
              markDefs: [],
            },
          ],
        },
        {
          _key: 'b',
          _type: 'prose',
          body: [
            {
              _key: 'p1',
              _type: 'block',
              style: 'normal',
              children: [{ _key: 's1', _type: 'span', text: 'World', marks: [] }],
              markDefs: [],
            },
          ],
        },
        { _key: 'c', _type: 'mediaFigure', media: 'media-1', caption: 'A caption' },
        { _key: 'd', _type: 'quote', text: 'To be', author: 'Hamlet' },
        {
          _key: 'e',
          _type: 'embed',
          provider: 'youtube',
          url: 'https://youtu.be/x',
          consentRequired: true,
        },
      ],
      notes,
    )
    const keys = document.map((node) => node._key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(document.map((node) => node._type)).toEqual([
      'block',
      'block',
      'media',
      'block',
      'block',
    ])
    expect(notes).toHaveLength(1)
  })
})
