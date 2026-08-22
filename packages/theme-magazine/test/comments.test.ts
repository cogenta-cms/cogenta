import { type PublicComment, renderCommentsSection, serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'

/**
 * `renderCommentsSection` is shared, unmodified, from `@cogenta/theme-kit` —
 * this asserts this theme wires it up correctly (imports it, serialises it)
 * rather than re-testing the shared module's own logic, which `theme-kit`'s
 * own test suite already covers.
 */

const BASE_OPTIONS = {
  open: true,
  action: '/api/comments',
  collection: 'post',
  entryId: 'entry-1',
  locale: null,
  pagePath: '/dispatches/hello-world',
  renderedAt: 1_700_000_000_000,
} as const

describe('renderCommentsSection', () => {
  it('renders an empty thread with a form when comments are open', () => {
    const html = serialize(renderCommentsSection({ ...BASE_OPTIONS, comments: [] }))
    expect(html).toContain('No comments yet.')
    expect(html).toContain('<form')
    expect(html).toContain('method="post"')
    expect(html).toContain('action="/api/comments"')
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
      body: '<script>alert(1)</script><img src=x onerror=alert(2)>',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const html = serialize(renderCommentsSection({ ...BASE_OPTIONS, comments: [malicious] }))
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>Eve</b>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;b&gt;Eve&lt;/b&gt;')
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
    const repliesIndex = html.indexOf('cg-comment__replies')
    const childIndex = html.indexOf('id="comment-c2"')
    expect(parentIndex).toBeGreaterThanOrEqual(0)
    expect(repliesIndex).toBeGreaterThan(parentIndex)
    expect(childIndex).toBeGreaterThan(repliesIndex)
  })

  it('carries the honeypot field and the render-timestamp field, both hidden from a real visitor', () => {
    const html = serialize(renderCommentsSection({ ...BASE_OPTIONS, comments: [] }))
    expect(html).toContain('name="website"')
    expect(html).toContain('name="_ts"')
    expect(html).toContain('value="1700000000000"')
    expect(html).toContain('aria-hidden="true"')
  })

  it('echoes redirectTo as the page path, so a no-JS submission returns here', () => {
    const html = serialize(renderCommentsSection({ ...BASE_OPTIONS, comments: [] }))
    expect(html).toContain('name="redirectTo"')
    expect(html).toContain('value="/dispatches/hello-world"')
  })
})
