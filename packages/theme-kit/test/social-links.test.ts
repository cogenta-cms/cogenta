import { describe, expect, it } from 'vitest'
import type { ChromeLink } from '../src/chrome.js'
import { renderSocialLinks } from '../src/chrome.js'
import { serialize } from '../src/html.js'

function html(links: readonly ChromeLink[] | undefined): string {
  const node = renderSocialLinks(links)
  return node === null ? '' : serialize(node)
}

describe('renderSocialLinks', () => {
  it('returns null when there is nothing to show', () => {
    expect(renderSocialLinks(undefined)).toBeNull()
    expect(renderSocialLinks([])).toBeNull()
  })

  it('picks the right icon for every recognised platform host', () => {
    const cases: readonly [string, string][] = [
      ['https://x.com/cogenta', 'M4 4l6.7'],
      ['https://twitter.com/cogenta', 'M4 4l6.7'],
      ['https://www.facebook.com/cogenta', 'M14 4h-2.2'],
      ['https://www.linkedin.com/company/cogenta', 'M10.5 20V10h3'],
      ['https://youtube.com/@cogenta', 'M10 9l6 3-6 3z'],
      ['https://youtu.be/xyz', 'M10 9l6 3-6 3z'],
      ['https://github.com/cogenta', 'M12 .297c-6.63'],
      ['https://bsky.app/profile/cogenta', 'M5.202 2.857'],
      ['https://tiktok.com/@cogenta', 'M12.525.02'],
      ['https://pinterest.com/cogenta', 'M12.017 0C5.396'],
    ]
    for (const [href, needle] of cases) {
      const out = html([{ label: 'x', href }])
      expect(out, href).toContain(needle)
    }
    expect(html([{ label: 'x', href: 'https://instagram.com/cogenta' }])).toContain('M8 3H16A5')
    expect(html([{ label: 'x', href: 'https://threads.net/@cogenta' }])).toContain('M18.263 11.097')
  })

  it('detects a Mastodon instance by its @-prefixed path, not by a fixed domain', () => {
    const out = html([{ label: 'Mastodon', href: 'https://mastodon.social/@cogenta' }])
    expect(out).toContain('M23.268 5.313')
  })

  it('falls back to the generic link icon for an unrecognised host', () => {
    const out = html([{ label: 'Blog', href: 'https://cogenta.dev/blog' }])
    expect(out).toContain('M5 8H9A4')
  })

  it('falls back to the generic link icon for an unparseable href', () => {
    const out = html([{ label: 'Bad', href: 'not a url' }])
    expect(out).toContain('M5 8H9A4')
  })

  it('escapes a hostile label and href', () => {
    const out = html([{ label: '<script>alert(1)</script>', href: 'javascript:alert(1)"onload=x' }])
    expect(out).not.toContain('<script>alert')
    expect(out).toContain('&lt;script&gt;')
    expect(out).not.toContain('"onload=x')
  })

  it('gives every link the visually-hidden label text and the me/external-link rel', () => {
    const out = html([{ label: 'Cogenta on X', href: 'https://x.com/cogenta' }])
    expect(out).toContain('class="cg-visually-hidden"')
    expect(out).toContain('Cogenta on X')
    expect(out).toContain('rel="me noopener noreferrer"')
    expect(out).toContain('target="_blank"')
  })

  it('applies the requested list and item classes', () => {
    const node = renderSocialLinks([{ label: 'x', href: 'https://x.com/cogenta' }], {
      className: 'cg-footer__social',
      itemClassName: 'cg-footer__social-item',
    })
    expect(node?.attrs.class).toBe('cg-footer__social')
    const [item] = node?.children ?? []
    expect(item && item.kind === 'element' ? item.attrs.class : undefined).toBe(
      'cg-footer__social-item',
    )
  })

  it('draws an official brand silhouette with the nonzero rule its path was designed for', () => {
    const out = html([{ label: 'GitHub', href: 'https://github.com/cogenta' }])
    expect(out).not.toContain('fill-rule')
    expect(out.match(/<path/g)?.length).toBe(1)
  })

  it('renders one icon per link, aria-hidden and unlabelled by itself', () => {
    const out = html([
      { label: 'A', href: 'https://x.com/a' },
      { label: 'B', href: 'https://github.com/b' },
    ])
    expect(out.match(/<svg/g)?.length).toBe(2)
    expect(out).toContain('aria-hidden="true"')
  })
})
