import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { inlineImports, loadThemeCss, minifyCss } from '../src/commands/theme-css.js'
import { joinStyles } from '../src/commands/theme-render.js'

/**
 * `cogenta serve` has no bundler, so this file is the whole of its CSS
 * pipeline. Two things it must never do — break a string literal, or drop a
 * declaration — would each show up as a silently wrong-looking page rather than
 * as an error, which is why they are asserted here rather than eyeballed.
 */

describe('minifyCss', () => {
  it('drops comments and collapses whitespace', () => {
    const css = minifyCss(`
      /* a comment */
      .a {
        color: red;
        margin: 0;
      }
    `)
    expect(css).toBe('.a{color: red;margin: 0}')
  })

  it('leaves a string literal exactly as written', () => {
    // `content: " — "` loses its spaces to any regex that squeezes blindly, and
    // the em dash separator of `.cg-figure__credit` disappears with them.
    expect(minifyCss('.a::before { content: " — "; }')).toBe('.a::before{content: " — "}')
  })

  it('does not treat a comment opener inside a string as a comment', () => {
    expect(minifyCss('.a { content: "/* not a comment */"; }')).toBe(
      '.a{content: "/* not a comment */"}',
    )
  })

  it('keeps the space a media feature needs', () => {
    expect(minifyCss('@media (min-width: 60rem) { .a { color: red } }')).toContain(
      '@media (min-width: 60rem)',
    )
  })

  it('keeps a descendant combinator, which is a space with meaning', () => {
    expect(minifyCss('.a  .b { color: red }')).toBe('.a .b{color: red}')
  })
})

describe('inlineImports', () => {
  const sheets = new Map([
    ['file:///theme.css', '@import "./tokens.css";\n@import "./blocks.css";\n.after{}'],
    ['file:///tokens.css', ':root{--a:1}'],
    ['file:///blocks.css', '.b{}'],
  ])
  const read = async (url: URL): Promise<string> => {
    const found = sheets.get(url.href)
    if (found === undefined) throw new Error(`no such sheet: ${url.href}`)
    return found
  }

  it('replaces each relative import with the file it names, in order', async () => {
    const css = await inlineImports(new URL('file:///theme.css'), { read })
    expect(css.replace(/\s+/g, '')).toBe(':root{--a:1}.b{}.after{}')
  })

  it('leaves a non-relative import alone rather than reaching outside the theme', async () => {
    const remote = new Map([['file:///x.css', '@import "https://fonts.example/x.css";\n.a{}']])
    const css = await inlineImports(new URL('file:///x.css'), {
      read: async (url) => remote.get(url.href) as string,
    })
    expect(css).toContain('@import "https://fonts.example/x.css";')
  })

  it('stops rather than looping when a sheet imports itself', async () => {
    const cyclic = new Map([['file:///loop.css', '@import "./loop.css";\n.a{}']])
    const css = await inlineImports(new URL('file:///loop.css'), {
      read: async (url) => cyclic.get(url.href) as string,
      depth: 3,
    })
    expect(css).toContain('.a{}')
  })
})

describe('the theme stylesheet cogenta serve actually sends', () => {
  it('resolves the real package and flattens its layers into one sheet', async () => {
    const css = await loadThemeCss(
      { read: (url) => readFile(url, 'utf8') },
      '@cogenta/theme-canonical',
    )
    expect(css).not.toBeNull()
    const sheet = css as string
    // One marker from each layer, so a lost `@import` fails here.
    expect(sheet).toContain('--cg-canvas')
    expect(sheet).toContain('.cg-skip-link')
    expect(sheet).toContain('.cg-site-header')
    expect(sheet).toContain('.cg-hero__title')
    expect(sheet).toContain('.cg-entry__title')
    expect(sheet).toContain('.cg-archive__pager')
    expect(sheet).toContain('.cg-comment__meta')
    // No relative import is left unresolved: that would be a second request
    // for a file the page cannot reach. Since L27 the canonical theme loads its
    // two web fonts, so exactly one import remains, and it is the remote
    // Google Fonts request the page head preconnects to.
    const imports = [...sheet.matchAll(/@import\s+url\(["']?([^"')]+)["']?\)/g)].map(
      (match) => match[1],
    )
    expect(imports).toHaveLength(sheet.match(/@import/g)?.length ?? 0)
    expect(imports).toHaveLength(1)
    expect(imports[0]).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?family=Instrument\+Sans/)
  })

  it('sends the design system, not just the skin variables it is built from', async () => {
    const css = (await loadThemeCss(
      { read: (url) => readFile(url, 'utf8') },
      '@cogenta/theme-canonical',
    )) as string
    expect(css).toContain('light-dark(')
    expect(css).toContain('color-scheme:')
  })

  it("keeps a theme's web font import first, where a browser still honours it", async () => {
    const theme = (await loadThemeCss(
      { read: (url) => readFile(url, 'utf8') },
      '@cogenta/theme-saas',
    )) as string
    expect(theme).toContain('@import url("https://fonts.googleapis.com/')
    const joined = joinStyles(':root{--cogenta-color-bg: #fff}', theme) as string
    // CSS drops any @import that follows another rule, so the font never loads.
    expect(joined.startsWith('@import url("https://fonts.googleapis.com/')).toBe(true)
    const firstRule = joined.indexOf('{')
    expect(joined.lastIndexOf('@import', firstRule)).toBe(joined.lastIndexOf('@import'))
    expect(joined).toContain(':root{--cogenta-color-bg: #fff}')
  })
})

describe('joinStyles', () => {
  it('hoists every remote import above the first rule, once each', () => {
    const joined = joinStyles(
      ':root{--a: 1}',
      '@import url("https://example.test/a.css");.b{color: red}@import "https://example.test/c.css" screen;@import url("https://example.test/a.css");',
    )
    expect(joined).toBe(
      '@import url("https://example.test/a.css");\n@import "https://example.test/c.css" screen;\n:root{--a: 1}\n.b{color: red}',
    )
  })

  it("drops a skin's font import the theme already loads, and keeps one it does not", () => {
    const skin =
      '@import url("https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..800&display=swap");' +
      '@import url("https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900&display=swap");' +
      ':root{--a: 1}'
    const theme =
      '@import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..800&family=Libre+Franklin:wght@400..800&display=swap");.b{color: red}'
    const joined = joinStyles(skin, theme) as string
    expect(joined.match(/family=Fraunces/g)).toHaveLength(1)
    expect(joined).toContain('family=Playfair+Display')
    expect(joined).toContain('family=Libre+Franklin')
  })

  it('leaves a sheet without imports untouched', () => {
    expect(joinStyles(':root{--a: 1}', '.b{color: red}')).toBe(':root{--a: 1}\n.b{color: red}')
    expect(joinStyles(null, null)).toBeNull()
  })
})
