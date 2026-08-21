import { describe, expect, it } from 'vitest'
import {
  COGENTA_VERSION,
  DOCS,
  getDocPage,
  listDocPages,
} from '../../src/documentation/docs-content.js'

/**
 * L22 task 7 — the bundling/rendering logic behind the in-admin documentation
 * browser, tested apart from the full route/component (see
 * `test/routes/documentation-docs.test.tsx` for that). This proves the real
 * `docs-site/content/**` files were picked up by Vite's `import.meta.glob`,
 * parsed, rendered and sorted — not a mocked fixture standing in for them.
 */

describe('COGENTA_VERSION', () => {
  it('reads a real semver string from @cogenta/core/package.json', () => {
    expect(COGENTA_VERSION).toMatch(/^\d+\.\d+\.\d+/u)
  })
})

describe('DOCS', () => {
  it('loads every real functional and technical page, sorted by order', () => {
    expect(DOCS.functional.length).toBeGreaterThanOrEqual(9)
    expect(DOCS.technical.length).toBeGreaterThanOrEqual(7)

    for (const tree of ['functional', 'technical'] as const) {
      const orders = DOCS[tree].map((page) => page.order)
      expect(orders).toEqual([...orders].sort((a, b) => a - b))
    }

    expect(DOCS.functional[0]?.slug).toBe('index')
    expect(DOCS.technical[0]?.slug).toBe('index')
  })

  it('includes the real docs/guide-plugin.md, not a copy under docs-site/content', () => {
    const plugin = DOCS.technical.find((page) => page.slug === 'creating-a-plugin')
    expect(plugin).toBeDefined()
    expect(plugin?.title).toBe('Creating a plugin')
    expect(plugin?.html).toContain('90% of WordPress compromises go through a plugin')
  })

  it('rewrites a cross-tree link found in the real content into an in-admin route', () => {
    const page = DOCS.functional.find((item) => item.slug === 'personnaliser-lapparence')
    expect(page).toBeDefined()
    // No `/admin` prefix here: `import.meta.env.BASE_URL` is `/` in this test
    // environment (as `documentation-docs.test.tsx`'s own routes, none of
    // them under `/admin`, already assume) — `docs-content.ts`'s `BASE_PATH`
    // reads that same value, exactly what makes the admin's local dev server
    // (also served at `/`) work without a hard-coded `/admin` prefix.
    expect(page?.html).toContain('href="/documentation/docs/technical/creating-a-theme"')
    expect(page?.html).not.toContain('.html')
  })

  it('rewrites the download links in the technical index to real GitHub source directories', () => {
    const page = DOCS.technical.find((item) => item.slug === 'index')
    expect(page).toBeDefined()
    expect(page?.html).toContain(
      'href="https://github.com/cogenta-cms/cogenta/tree/main/examples/theme-starter"',
    )
    expect(page?.html).not.toContain('../downloads/')
  })
})

describe('getDocPage / listDocPages', () => {
  it('finds a real page by tree and slug', () => {
    const page = getDocPage('functional', 'gerer-le-contenu')
    expect(page?.title).toBe('Gérer le contenu')
  })

  it('returns undefined for a page that does not exist', () => {
    expect(getDocPage('technical', 'does-not-exist')).toBeUndefined()
  })

  it('lists summaries in the same order as DOCS', () => {
    expect(listDocPages('technical').map((page) => page.slug)).toEqual(
      DOCS.technical.map((page) => page.slug),
    )
  })
})
