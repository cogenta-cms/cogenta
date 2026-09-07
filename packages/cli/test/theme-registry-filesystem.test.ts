import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  availableThemes,
  configureThemeRegistry,
  DEFAULT_THEME_NAME,
  resolveTheme,
} from '../src/commands/theme-registry.js'

/**
 * Fiche 73 task 1 — a theme dropped in `<projectRoot>/themes/<name>/` becomes
 * activable, with no npm package, no `@cogenta/cli` dependency change. A
 * dedicated file, not added to `theme-registry.test.ts`: `configureThemeRegistry`
 * sets module-level state for the life of the process, and vitest gives each
 * test *file* its own module instance — keeping this here means the existing
 * file's assertion ("every listed theme is a `BUILTIN_THEMES` entry") never
 * has to account for a `projectRoot` some other test configured.
 */

// The full vocabulary (`@cogenta/blocks`'s `VOCABULARY_NAMES`, hardcoded
// rather than imported — a fixture theme lives outside this monorepo's
// `node_modules` resolution, exactly like a real site's `themes/` folder
// would) — `verifyTheme` (now genuinely exercised, see the tests below)
// refuses a manifest that does not cover it, same rule a built-in theme
// already has to meet before it ever ships.
const FULL_VOCABULARY = [
  'hero',
  'prose',
  'mediaFigure',
  'featureGrid',
  'cta',
  'gallery',
  'quote',
  'faq',
  'stats',
  'logos',
  'collectionList',
  'embed',
  'testimonial',
  'pricingTable',
  'accordion',
  'statCounter',
  'logoStrip',
]

const CANONICAL_MANIFEST = `
export default {
  name: 'fixture-theme',
  version: '1.0.0',
  engine: '^1.0.0',
  blocks: '^1.0.0',
  implements: ${JSON.stringify(FULL_VOCABULARY)},
  collections: '*',
  runtime: 'server',
  tokens: 'theme.tokens.json',
  description: 'A theme dropped straight into themes/, no npm package.',
  author: 'A developer, not an agent',
}
`

const RENDER_MODULE = `
export function renderPage() { return { tag: 'main', attrs: {}, children: [] } }
export function renderChrome() { return { head: '', header: '', footer: '' } }
`

// Fiche 73 feedback (contract-guardian, 2026-09-07): a theme dropped into
// themes/ was importing straight into the main `cogenta serve` process with
// no security scan at all — `verifyTheme` exists precisely to catch this and
// was not being called. This is the regression test for that fix.
const RENDER_MODULE_WITH_FORBIDDEN_IMPORT = `
import { readFileSync } from 'node:fs'
export function renderPage() { readFileSync('/etc/passwd'); return { tag: 'main', attrs: {}, children: [] } }
export function renderChrome() { return { head: '', header: '', footer: '' } }
`

async function makeProjectRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'cogenta-theme-fs-'))
}

async function writeFixtureTheme(
  projectRoot: string,
  name: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  const themeRoot = join(projectRoot, 'themes', name)
  await mkdir(themeRoot, { recursive: true })
  for (const [file, content] of Object.entries(files)) {
    await writeFile(join(themeRoot, file), content, 'utf8')
  }
}

describe('theme registry — themes/ directory (fiche 73)', () => {
  const roots: string[] = []

  afterEach(async () => {
    while (roots.length > 0) {
      const root = roots.pop()
      if (root !== undefined) await rm(root, { recursive: true, force: true })
    }
  })

  it('never touches the filesystem before configureThemeRegistry is ever called', async () => {
    // Runs first, deliberately — `configuredProjectRoot` is module-level
    // state with no "unset", so this genuinely proves the opt-in default
    // (every process that never boots `cogenta serve`, e.g.
    // `cogenta skin generate`) only if nothing earlier in this file has
    // called `configureThemeRegistry` yet.
    const themes = await availableThemes()
    expect(themes.every((theme) => theme.name.startsWith('@cogenta/'))).toBe(true)
  })

  it('lists a valid theme dropped in themes/, with the manifest as the source of its gallery card', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    await writeFixtureTheme(root, 'theme-alpha', {
      'theme.config.mjs': CANONICAL_MANIFEST,
      'theme.render.mjs': RENDER_MODULE,
    })
    configureThemeRegistry({ projectRoot: root })

    const themes = await availableThemes()
    const entry = themes.find((theme) => theme.name === 'theme-alpha')
    expect(entry).toBeDefined()
    expect(entry?.description).toBe('A theme dropped straight into themes/, no npm package.')
    expect(entry?.version).toBe('1.0.0')
    expect(entry?.author).toBe('A developer, not an agent')
  })

  it('resolves a real renderPage/renderChrome from the local theme, no different from a built-in one', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    await writeFixtureTheme(root, 'theme-beta', {
      'theme.config.mjs': CANONICAL_MANIFEST,
      'theme.render.mjs': RENDER_MODULE,
    })
    configureThemeRegistry({ projectRoot: root })

    const theme = await resolveTheme('theme-beta')
    expect(typeof theme.renderPage).toBe('function')
    expect(typeof theme.renderChrome).toBe('function')
    expect(theme.renderPage).not.toBe((await resolveTheme(DEFAULT_THEME_NAME)).renderPage)
  })

  it('refuses (falls back, never imports) a theme whose code carries a forbidden import — node:fs, in this case', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    await writeFixtureTheme(root, 'theme-forbidden', {
      'theme.config.mjs': CANONICAL_MANIFEST,
      'theme.render.mjs': RENDER_MODULE_WITH_FORBIDDEN_IMPORT,
    })
    configureThemeRegistry({ projectRoot: root })

    const theme = await resolveTheme('theme-forbidden')
    expect(theme).toBe(await resolveTheme(DEFAULT_THEME_NAME))
    // Not just resolution — it must not even be offered in the gallery.
    const themes = await availableThemes()
    expect(themes.some((info) => info.name === 'theme-forbidden')).toBe(false)
  })

  it('falls back to the default theme, rather than crashing, when the manifest is missing', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    await writeFixtureTheme(root, 'no-manifest', { 'theme.render.mjs': RENDER_MODULE })
    configureThemeRegistry({ projectRoot: root })

    const theme = await resolveTheme('no-manifest')
    expect(theme).toBe(await resolveTheme(DEFAULT_THEME_NAME))
  })

  it('falls back to the default theme when the render module is missing', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    await writeFixtureTheme(root, 'no-render', { 'theme.config.mjs': CANONICAL_MANIFEST })
    configureThemeRegistry({ projectRoot: root })

    const theme = await resolveTheme('no-render')
    expect(theme).toBe(await resolveTheme(DEFAULT_THEME_NAME))
  })

  it('never lists an invalid local theme — a stray directory is not an error to report, just nothing to offer', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    await writeFixtureTheme(root, 'no-manifest-listed', { 'theme.render.mjs': RENDER_MODULE })
    configureThemeRegistry({ projectRoot: root })

    const themes = await availableThemes()
    expect(themes.some((theme) => theme.name === 'no-manifest-listed')).toBe(false)
  })

  // Fiche 73, piège n°4 — a folder in themes/ never shadows a real built-in
  // package of the same name.
  it('never lets a themes/ folder shadow a built-in theme of the same name', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    await writeFixtureTheme(root, DEFAULT_THEME_NAME, {
      'theme.config.mjs': CANONICAL_MANIFEST,
      'theme.render.mjs': RENDER_MODULE,
    })
    configureThemeRegistry({ projectRoot: root })

    const theme = await resolveTheme(DEFAULT_THEME_NAME)
    // The real built-in canonical theme, not the fixture — the fixture's
    // renderPage/renderChrome are trivial stand-ins the real theme never has.
    const themes = await availableThemes()
    const entries = themes.filter((info) => info.name === DEFAULT_THEME_NAME)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.author).toBe('Cogenta')
    expect(entries[0]?.author).not.toBe('A developer, not an agent')
    expect(typeof theme.renderPage).toBe('function')
  })
})
