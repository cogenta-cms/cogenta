import type { ChromeBrand, ImageSource } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderBrandMark } from '../src/chrome.js'

function source(src: string): ImageSource {
  return {
    kind: 'image',
    src,
    srcset: `${src} 1x`,
    width: 240,
    height: 60,
    alt: 'ignored — a logo is named by the site, not by the asset',
    focal: null,
  }
}

const BRAND: ChromeBrand = {
  name: 'Atelier <Nord>',
  logo: source('/_image?id=light&w=480'),
  logoDark: null,
  faviconUrl: null,
}

describe('renderBrandMark', () => {
  it('returns null when the site has no logo, so a theme falls back to its own wordmark', () => {
    expect(renderBrandMark(undefined)).toBeNull()
    expect(renderBrandMark({ ...BRAND, logo: null })).toBeNull()
  })

  it('names the logo with the site name, never with the asset alt text', () => {
    const html = renderBrandMark(BRAND) ?? ''
    expect(html).toContain('alt="Atelier &lt;Nord&gt;"')
    expect(html).not.toContain('ignored')
  })

  it('escapes the site name and the URLs it writes', () => {
    const html = renderBrandMark({ ...BRAND, logo: source('/_image?id=a&w=1"onload=x') }) ?? ''
    expect(html).not.toContain('"onload=x')
    expect(html).toContain('&quot;onload=x')
  })

  it('emits a plain img when there is no dark variant', () => {
    const html = renderBrandMark(BRAND) ?? ''
    expect(html.startsWith('<img')).toBe(true)
    expect(html).not.toContain('<picture')
  })

  it('offers the dark variant beside the light one rather than choosing between them', () => {
    const html = renderBrandMark({ ...BRAND, logoDark: source('/_image?id=dark&w=480') }) ?? ''
    expect(html).toContain('<picture>')
    expect(html).toContain('media="(prefers-color-scheme: dark)"')
    // Both sources are present: nothing was decided server-side.
    expect(html).toContain('id=dark')
    expect(html).toContain('id=light')
  })

  it('carries the intrinsic size so the header does not reflow once the logo loads', () => {
    const html = renderBrandMark(BRAND) ?? ''
    expect(html).toContain('width="240"')
    expect(html).toContain('height="60"')
  })

  it('applies the class the theme asked for, and none of its own', () => {
    expect(renderBrandMark(BRAND, { className: 'x-mark' })).toContain('class="x-mark"')
    expect(renderBrandMark(BRAND)).not.toContain('class=')
  })
})
