import { describe, expect, it } from 'vitest'
import { commentNoticeFor, type PublicComment, renderCommentsSection } from '../src/comments.js'
import { serialize } from '../src/html.js'

/**
 * The comment section speaks the page's language (L36 audit: it was English on
 * every French site) and tells a visitor what became of what they just sent.
 */

const BASE = {
  open: true,
  action: '/api/comments',
  collection: 'post',
  entryId: 'entry-1',
  pagePath: '/blog/bonjour',
  renderedAt: 1_700_000_000_000,
} as const

const COMMENT: PublicComment = {
  id: 'c1',
  parentId: null,
  authorName: 'Camille',
  authorUrl: null,
  body: 'Très clair, merci.',
  createdAt: '2026-03-12T10:00:00.000Z',
}

describe('the comment section', () => {
  it('writes every word of a French page in French, the date included', () => {
    const html = serialize(renderCommentsSection({ ...BASE, locale: 'fr', comments: [COMMENT] }))
    for (const word of [
      'Commentaires (1)',
      'Nom',
      'Adresse e-mail (non publiée)',
      'Site web (facultatif)',
      'Publier le commentaire',
      '12 mars 2026',
    ]) {
      expect(html).toContain(word)
    }
    for (const word of ['Comments', 'Name', 'Post comment', 'Website']) {
      expect(html).not.toContain(word)
    }
  })

  it('stays English on an English page', () => {
    const html = serialize(renderCommentsSection({ ...BASE, locale: 'en', comments: [] }))
    expect(html).toContain('No comments yet.')
    expect(html).toContain('Post comment')
  })

  it("uses the page's translator when given one, so a theme's own wording wins", () => {
    const html = serialize(
      renderCommentsSection({
        ...BASE,
        locale: 'fr',
        comments: [],
        t: (key) => (key === 'comments.submit' ? 'Envoyer mon avis' : key),
      }),
    )
    expect(html).toContain('Envoyer mon avis')
  })

  it('tells the visitor their comment awaits review, announced politely', () => {
    const html = serialize(
      renderCommentsSection({ ...BASE, locale: 'fr', comments: [], notice: 'pending' }),
    )
    expect(html).toContain('id="cg-comments"')
    expect(html).toMatch(/class="cg-comments__notice cg-comments__notice--pending" role="status"/)
    expect(html).toContain('Merci, votre commentaire sera publié après relecture.')
  })

  it('announces a refusal as an alert, in words a visitor can act on', () => {
    const html = serialize(
      renderCommentsSection({ ...BASE, locale: 'fr', comments: [], notice: 'rateLimited' }),
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('réessayez dans quelques minutes')
  })
})

describe('reading the notice from the redirect', () => {
  it('shows a comment held as spam as merely pending', () => {
    expect(commentNoticeFor('spam', null)).toBe('pending')
    expect(commentNoticeFor('pending', null)).toBe('pending')
    expect(commentNoticeFor('approved', null)).toBe('approved')
  })

  it('never says a honeypot or a fast submission tripped, only that it failed', () => {
    expect(commentNoticeFor('error', 'COMMENT_SPAM_DETECTED')).toBe('error')
    expect(commentNoticeFor('error', 'COMMENT_RATE_LIMITED')).toBe('rateLimited')
    expect(commentNoticeFor('error', 'COMMENT_BODY_INVALID')).toBe('invalid')
  })

  it('ignores a query it does not know', () => {
    expect(commentNoticeFor(null, null)).toBeUndefined()
    expect(commentNoticeFor('<script>', null)).toBeUndefined()
  })
})
