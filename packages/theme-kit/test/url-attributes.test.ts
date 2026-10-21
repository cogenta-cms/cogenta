import { describe, expect, it } from 'vitest'
import { h, serialize } from '../src/html.js'

/**
 * Security review of 2026-10-21: an editor's `javascript:` link — a call to
 * action, a rich-text link, an embed, a logo — reached the page as is and ran
 * on the site's origin, the admin's included, at the first click.
 * `serialize` is where every theme and every plugin tree becomes HTML, so
 * the scheme is checked there, once, for all of them.
 */
describe('URL attributes cannot carry a script', () => {
  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'java\tscript:alert(1)',
    '\u0001javascript:alert(1)',
    ' javascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
  ])('neutralises %j in a link', (href) => {
    expect(serialize(h('a', { href }, 'x'))).toBe('<a href="#">x</a>')
  })

  it.each([
    '/a/page',
    '#section',
    '?q=search',
    'https://example.com/x?y=1',
    'http://example.com',
    'mailto:hello@example.com',
    'tel:+33100000000',
    'page/with a:colon-later',
  ])('keeps %j as written', (href) => {
    expect(serialize(h('a', { href }, 'x'))).toContain(`href="${href}"`)
  })

  it('keeps an inline image source and refuses the same scheme as a link', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo='
    expect(serialize(h('img', { src: png, alt: '' }))).toContain(`src="${png}"`)
    expect(serialize(h('a', { href: png }, 'x'))).toBe('<a href="#">x</a>')
  })

  it('checks every attribute a browser follows, not only href', () => {
    const html = serialize(
      h(
        'form',
        { action: 'javascript:alert(1)' },
        h('button', { formaction: 'javascript:alert(2)' }, 'go'),
        h('iframe', { src: 'javascript:alert(3)' }),
      ),
    )
    expect(html).not.toContain('javascript:')
  })
})
