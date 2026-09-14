import { readFileSync } from 'node:fs'
import { type PublicComment, renderCommentsSection, serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'

/**
 * `renderCommentsSection` is `@cogenta/theme-kit`'s own, reused unchanged. This
 * is not a re-test of its logic: it checks that the classes this theme's
 * `base.css` styles still line up with what the function emits.
 */

const BASE = {
  open: true,
  action: '/api/comments',
  collection: 'event',
  entryId: 'entry-1',
  locale: null,
  pagePath: '/events/harvest-supper',
  renderedAt: 1_700_000_000_000,
} as const

const BASE_CSS = readFileSync(new URL('../src/styles/base.css', import.meta.url), 'utf8')

describe('comments, in this theme', () => {
  it('styles every class the shared section emits for a thread and its form', () => {
    const comment: PublicComment = {
      id: 'c1',
      parentId: null,
      authorName: 'Priya',
      authorUrl: null,
      body: 'Is there parking?',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const html = serialize(renderCommentsSection({ ...BASE, comments: [comment] }))
    const classes = new Set(
      [...html.matchAll(/class="([^"]+)"/g)].flatMap((match) => (match[1] as string).split(' ')),
    )
    for (const name of ['cg-comments', 'cg-comment', 'cg-comment__form', 'cg-comment__meta']) {
      expect(classes.has(name), name).toBe(true)
      expect(BASE_CSS, name).toContain(`.${name}`)
    }
  })

  it('never lets a comment body become HTML', () => {
    const malicious: PublicComment = {
      id: 'c2',
      parentId: null,
      authorName: '<b>Eve</b>',
      authorUrl: null,
      body: '<script>alert(1)</script>',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const html = serialize(renderCommentsSection({ ...BASE, comments: [malicious] }))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
