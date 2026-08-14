import { describe, expect, it } from 'vitest'
import { renderSkinPreview } from '../src/skin-preview.js'

const TOKENS = {
  color: {
    bg: '#ffffff',
    fg: '#16181d',
    accent: '#1d4ed8',
    accentFg: '#ffffff',
    muted: '#f2f4f7',
    mutedFg: '#3f4655',
    border: '#d7dbe2',
  },
  font: { sans: 'sans-serif', serif: 'serif', mono: 'monospace', scale: 1.25, baseSize: '1rem' },
  space: { unit: '0.25rem', density: 'comfortable' as const },
  radius: { sm: '0.25rem', md: '0.5rem', lg: '1rem' },
  motion: { duration: '180ms', easing: 'linear', reduced: true },
  shadow: { sm: '0 1px 2px rgba(0,0,0,.1)', md: '0 6px 24px rgba(0,0,0,.1)' },
}

describe('renderSkinPreview', () => {
  it('renders exactly three real, distinct pages through the generic theme pipeline', () => {
    const pages = renderSkinPreview(TOKENS, 'My Site')

    expect(pages).toHaveLength(3)
    const filenames = pages.map((page) => page.filename)
    expect(new Set(filenames).size).toBe(3)
  })

  it('embeds the skin as real generated CSS custom properties, never raw HTML from a block', () => {
    const [page] = renderSkinPreview(TOKENS, 'My Site')

    expect(page?.html).toContain('--cogenta-color-bg: #ffffff')
    expect(page?.html).toContain('--cogenta-color-accent: #1d4ed8')
    expect(page?.html).toContain('prefers-reduced-motion')
  })

  it('renders real page content, not a static placeholder', () => {
    const pages = renderSkinPreview(TOKENS, 'My Site')

    const landing = pages.find((page) => page.title === 'Landing')
    expect(landing?.html).toContain('A site that runs itself')
    expect(landing?.html).toContain('cg-hero')

    const article = pages.find((page) => page.title === 'Article')
    expect(article?.html).toContain('cg-quote')

    const listing = pages.find((page) => page.title === 'Listing')
    expect(listing?.html).toContain('cg-collection')
  })
})
