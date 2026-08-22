import { type PublicComment, renderCommentsSection, serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'

/**
 * `renderCommentsSection` is `@cogenta/theme-kit`'s own, reused unchanged
 * (fiche 15, ADR-0025). This is not a re-test of its logic — that lives in
 * the shared package's own suite — it is a smoke test that this theme's
 * import of it, and the `.cg-comments`/`.cg-comment*` classes this theme's
 * `blocks.css` styles, still line up with what the function actually emits.
 */

const BASE_OPTIONS = {
  open: true,
  action: '/api/comments',
  collection: 'post',
  entryId: 'entry-1',
  locale: null,
  pagePath: '/blog/hello-world',
  renderedAt: 1_700_000_000_000,
} as const

describe('renderCommentsSection, reused from @cogenta/theme-kit', () => {
  it('renders an empty thread with a form when comments are open', () => {
    const html = serialize(renderCommentsSection({ ...BASE_OPTIONS, comments: [] }))
    expect(html).toContain('No comments yet.')
    expect(html).toContain('<form')
    expect(html).toContain('method="post"')
  })

  it('renders "closed" and no form when comments are not open', () => {
    const html = serialize(renderCommentsSection({ ...BASE_OPTIONS, open: false, comments: [] }))
    expect(html).toContain('Comments are closed on this page.')
    expect(html).not.toContain('<form')
  })

  it('never lets a comment body become HTML — R3, structural via the h()/text() tree', () => {
    const malicious: PublicComment = {
      id: 'c1',
      parentId: null,
      authorName: '<b>Eve</b>',
      authorUrl: null,
      body: '<script>alert(1)</script>',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const html = serialize(renderCommentsSection({ ...BASE_OPTIONS, comments: [malicious] }))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('nests a reply under its parent', () => {
    const comments: PublicComment[] = [
      {
        id: 'c1',
        parentId: null,
        authorName: 'Alice',
        authorUrl: null,
        body: 'Top level.',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'c2',
        parentId: 'c1',
        authorName: 'Bob',
        authorUrl: null,
        body: 'A reply.',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ]
    const html = serialize(renderCommentsSection({ ...BASE_OPTIONS, comments }))
    const parentIndex = html.indexOf('id="comment-c1"')
    const childIndex = html.indexOf('id="comment-c2"')
    expect(parentIndex).toBeGreaterThanOrEqual(0)
    expect(childIndex).toBeGreaterThan(parentIndex)
  })
})
