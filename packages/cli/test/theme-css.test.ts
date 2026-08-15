import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { inlineImports, loadThemeCss, minifyCss } from '../src/commands/theme-css.js'

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
  it('resolves the real package and flattens its three layers into one sheet', async () => {
    const css = await loadThemeCss({ read: (url) => readFile(url, 'utf8') })
    expect(css).not.toBeNull()
    const sheet = css as string
    // One marker from each layer, so a lost `@import` fails here.
    expect(sheet).toContain('--cg-canvas')
    expect(sheet).toContain('.cg-skip-link')
    expect(sheet).toContain('.cg-hero__title')
    // Nothing is left to fetch: an unresolved import would be a second request
    // the page cannot make, since the sheet is inlined in a <style> element.
    expect(sheet).not.toContain('@import')
  })

  it('sends the design system, not just the skin variables it is built from', async () => {
    const css = (await loadThemeCss({ read: (url) => readFile(url, 'utf8') })) as string
    expect(css).toContain('light-dark(')
    expect(css).toContain('color-scheme:')
  })
})
