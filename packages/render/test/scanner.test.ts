import { describe, expect, it } from 'vitest'
import { matchForbidden, scanCode, scanSource } from '../src/index.js'

/**
 * The lexer's edge cases, held separately from the theme fixtures: these are
 * the shapes that decide whether the check is trusted or worked around.
 */

const kinds = (code: string): string[] => scanCode(code).map((finding) => finding.kind)
const specifiers = (code: string): (string | null)[] =>
  scanCode(code).map((finding) => finding.specifier)

describe('matching a specifier against the forbidden list', () => {
  it('resolves subpaths to the module they belong to', () => {
    expect(matchForbidden('node:fs/promises')?.specifier).toBe('node:fs')
    expect(matchForbidden('@cogenta/core/db')?.specifier).toBe('@cogenta/core')
    expect(matchForbidden('drizzle-orm/postgres-js')?.specifier).toBe('drizzle-orm')
  })

  it('knows both spellings of a builtin', () => {
    expect(matchForbidden('fs')?.specifier).toBe('node:fs')
    expect(matchForbidden('node:fs')?.specifier).toBe('node:fs')
  })

  it('leaves everything a theme legitimately imports alone', () => {
    for (const allowed of [
      '@cogenta/blocks',
      '@cogenta/render',
      'astro',
      './Panel.astro',
      'nanoid',
    ]) {
      expect(matchForbidden(allowed)).toBeNull()
    }
  })
})

describe('the source scanner', () => {
  it('reads a specifier out of every static form', () => {
    expect(specifiers("import fs from 'node:fs'")).toEqual(['node:fs'])
    expect(specifiers("import 'node:net'")).toEqual(['node:net'])
    expect(specifiers("export { x } from 'node:vm'")).toEqual(['node:vm'])
    expect(specifiers("import type { Stats } from 'node:fs'")).toEqual(['node:fs'])
  })

  it('ignores a commented-out import, in either comment style', () => {
    expect(kinds("// import fs from 'node:fs'")).toEqual([])
    expect(kinds("/* import fs from 'node:fs' */")).toEqual([])
  })

  it('refuses a dynamic import it cannot read, and accepts one it can', () => {
    expect(kinds('const m = await import(name)')).toEqual(['unanalysable-import'])
    expect(kinds("const m = await import('node:' + 'fs')")).toEqual(['unanalysable-import'])
    expect(kinds(`const m = await import(\`node:\${x}\`)`)).toEqual(['unanalysable-import'])
    expect(kinds("const m = await import('./Panel.astro')")).toEqual([])
  })

  it('reads a template literal with no substitution as the string it is', () => {
    expect(specifiers('const m = await import(`node:fs`)')).toEqual(['node:fs'])
  })

  it('does not mistake a word for a module', () => {
    // `process`, `net` and `http` are the unprefixed spellings of forbidden
    // builtins *and* ordinary words. Only specifier position counts.
    expect(kinds("const label = ctx.t('process')")).toEqual([])
    expect(kinds("const css = 'net http https'")).toEqual([])
    expect(kinds("fetch('http://example.test/api')")).toEqual([])
  })

  it('is not derailed by a regular expression containing a quote', () => {
    expect(kinds('const q = /[\'"]/g\nconst safe = 1')).toEqual([])
    expect(specifiers("const q = /['\"]/g\nimport fs from 'node:fs'")).toEqual(['node:fs'])
  })

  it('reports the line and column of the specifier itself', () => {
    const findings = scanCode("const a = 1\nimport fs from 'node:fs'")

    expect(findings[0]?.line).toBe(2)
    expect(findings[0]?.column).toBe(16)
  })
})

describe('scanning an Astro file', () => {
  it('scans the frontmatter, the template expressions and the client scripts', () => {
    const source = [
      '---',
      "import { readFileSync } from 'node:fs'",
      '---',
      '',
      "<p>Here's prose with an apostrophe and the word process in it.</p>",
      "<div>{(await import('node:net')).connect()}</div>",
      '<script>',
      "  import('node:dgram')",
      '</script>',
    ].join('\n')

    const findings = scanSource('src/blocks/Hero.astro', source)

    expect(findings.map((finding) => finding.specifier)).toEqual([
      'node:fs',
      'node:net',
      'node:dgram',
    ])
    expect(findings.map((finding) => finding.line)).toEqual([2, 6, 8])
  })

  it('is not fooled by an apostrophe in prose before the import', () => {
    // A lexer that treated the apostrophe in `don't` as an opening quote would
    // swallow the rest of the line and miss what comes after it.
    const source = ["<p>Don't do that</p>", "<span>{await import('node:vm')}</span>"].join('\n')

    expect(scanSource('src/components/X.astro', source).map((f) => f.specifier)).toEqual([
      'node:vm',
    ])
  })
})
