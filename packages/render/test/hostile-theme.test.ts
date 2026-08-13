import { fileURLToPath } from 'node:url'
import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { inspectTheme, loadTheme, type ThemeInspection, verifyTheme } from '../src/index.js'

/**
 * The acceptance criterion of L3, spelled out in the spec: "un thème qui tente
 * d'importer node:fs ou d'accéder à la base est refusé à l'installation".
 *
 * The fixture is one theme carrying every route in at once, because that is
 * how a hostile theme would actually be written — not one attack per package,
 * hoping the reviewer looks at the right file.
 */

const HOSTILE = { name: 'hostile', directory: 'hostile-theme' }
const CANONICAL = { name: 'canonical', directory: 'canonical-theme' }
const PARTIAL = { name: 'partial', directory: 'partial-theme' }

interface Fixture {
  readonly name: string
  readonly directory: string
}

const rootOf = (fixture: Fixture): string =>
  fileURLToPath(new URL(`./fixtures/${fixture.directory}`, import.meta.url))

async function inspectFixture(fixture: Fixture): Promise<ThemeInspection> {
  const theme = await loadTheme({ theme: { name: fixture.name, root: rootOf(fixture) } })
  return inspectTheme({ root: theme.root, manifest: theme.manifest })
}

async function refusalOf(fixture: Fixture): Promise<unknown> {
  const theme = await loadTheme({ theme: { name: fixture.name, root: rootOf(fixture) } })
  return verifyTheme({ root: theme.root, manifest: theme.manifest }).catch(
    (caught: unknown) => caught,
  )
}

describe('a hostile theme', () => {
  it('is refused at installation, not merely reported', async () => {
    const error = await refusalOf(HOSTILE)

    expect(isCogentaError(error)).toBe(true)
    if (isCogentaError(error)) expect(error.code).toBe('THEME_IMPORT_FORBIDDEN')
  })

  it('names the file, the line and the import in the refusal', async () => {
    const error = await refusalOf(HOSTILE)

    expect(isCogentaError(error)).toBe(true)
    if (!isCogentaError(error)) return
    // Column 30 is the specifier itself, not the `import` keyword: the point
    // of the message is to put the cursor on the thing that is refused.
    expect(error.message).toContain('src/blocks/Hero.astro:3:30')
    expect(error.message).toContain('node:fs')
    expect(error.hint).toContain('ctx.content')
  })

  it('refuses a static import of a forbidden builtin in Astro frontmatter', async () => {
    const inspection = await inspectFixture(HOSTILE)

    expect(inspection.findings).toContainEqual(
      expect.objectContaining({
        file: 'src/blocks/Hero.astro',
        kind: 'forbidden-import',
        specifier: 'node:fs',
        line: 3,
      }),
    )
  })

  it('refuses the unprefixed spelling and a subpath of the same builtin', async () => {
    const inspection = await inspectFixture(HOSTILE)
    const direct = inspection.findings.filter((f) => f.file === 'src/components/direct.ts')

    expect(direct.map((f) => f.specifier)).toEqual(
      expect.arrayContaining(['fs', 'fs/promises', '@cogenta/core', '@cogenta/schema']),
    )
    // The canonical spelling is reported next to the one that was written, so
    // the author is told what `fs` actually is.
    expect(direct.find((f) => f.specifier === 'fs/promises')?.resolved).toBe('node:fs')
  })

  it('refuses a database driver, including through a subpath', async () => {
    const inspection = await inspectFixture(HOSTILE)
    const database = inspection.findings.filter((f) => f.file === 'src/components/database.ts')

    expect(database.map((f) => f.specifier)).toEqual(['drizzle-orm/postgres-js', 'postgres'])
    expect(database.every((f) => f.forbiddenKind === 'database-driver')).toBe(true)
  })

  it('refuses an import whose specifier is assembled at runtime', async () => {
    const inspection = await inspectFixture(HOSTILE)

    expect(inspection.findings).toContainEqual(
      expect.objectContaining({ file: 'src/components/aliased.ts', kind: 'unanalysable-import' }),
    )
  })

  it('refuses CommonJS smuggled in through createRequire', async () => {
    const inspection = await inspectFixture(HOSTILE)
    const smuggled = inspection.findings.filter((f) => f.file === 'src/components/smuggled.ts')

    // The factory call is what refuses the theme: a handle stored in a variable
    // and called later is beyond a lexer, so the door itself is what is shut.
    expect(smuggled).toContainEqual(expect.objectContaining({ kind: 'commonjs-require' }))
    expect(smuggled).toContainEqual(
      expect.objectContaining({ kind: 'forbidden-import', specifier: 'node:net' }),
    )
  })

  it('refuses an import hidden in a template expression, behind prose apostrophes', async () => {
    const inspection = await inspectFixture(HOSTILE)

    expect(inspection.findings).toContainEqual(
      expect.objectContaining({
        file: 'src/components/Dynamic.astro',
        kind: 'forbidden-import',
        specifier: 'node:child_process',
      }),
    )
  })

  it('refuses a forbidden import inside a client script tag', async () => {
    const inspection = await inspectFixture(HOSTILE)

    expect(inspection.findings).toContainEqual(
      expect.objectContaining({
        file: 'src/components/Dynamic.astro',
        kind: 'forbidden-import',
        specifier: 'https',
        resolved: 'node:https',
      }),
    )
  })

  it('refuses an alias declared in package.json rather than in the sources', async () => {
    const inspection = await inspectFixture(HOSTILE)
    const manifest = inspection.findings.filter((f) => f.file === 'package.json')

    expect(manifest.map((f) => f.resolved).sort()).toEqual(['better-sqlite3', 'node:fs'])
    expect(manifest.find((f) => f.resolved === 'node:fs')?.specifier).toContain('#storage')
  })
})

describe('a well-formed theme', () => {
  it('passes the installation check', async () => {
    const theme = await loadTheme({
      theme: { name: CANONICAL.name, root: rootOf(CANONICAL) },
      verify: true,
    })

    expect(theme.inspection?.ok).toBe(true)
    expect(theme.inspection?.findings).toEqual([])
    expect(theme.inspection?.filesScanned).toBeGreaterThan(0)
  })

  it('is not refused for prose, class names or commented-out imports', async () => {
    const inspection = await inspectFixture(CANONICAL)

    // The fixture contains `don't`, a class named `process`, the words `http`
    // and `net` inside strings, and a commented `import fs from 'node:fs'`.
    expect(inspection.findings).toEqual([])
  })
})

describe('an incomplete theme', () => {
  it('is refused when it does not implement the twelve blocks', async () => {
    const error = await refusalOf(PARTIAL)

    expect(isCogentaError(error)).toBe(true)
    if (!isCogentaError(error)) return
    expect(error.code).toBe('THEME_BLOCK_MISSING')
    expect(error.message).toContain('mediaFigure')
    expect(error.message).toContain('collectionList')
  })
})
