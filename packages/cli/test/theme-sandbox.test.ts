import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  checkThemeDeployment,
  cloneThemeIntoSandbox,
  createSandbox,
  deployThemeFromSandbox,
  listSandboxIds,
  renderSandboxPreview,
  sandboxDirectory,
} from '../src/commands/theme-sandbox.js'

/**
 * Fiche 73 task 4 — real filesystem fixtures, real `runIsolatedModule` calls
 * (nothing mocked). Fixtures live under `packages/cli/test/tmp/`, not the OS
 * temp directory `theme-registry-filesystem.test.ts` uses for its own theme
 * fixtures: this suite's render module and preview adapter both do a real
 * `import('@cogenta/theme-kit')`, which needs Node's own module resolution
 * to walk up to `packages/cli/node_modules` — a real dependency `@cogenta/cli`
 * already declares — exactly the way a real site's `themes/` folder needs
 * `@cogenta/theme-kit` installed in *its* own `node_modules` to work at all
 * (`docs/guide-theme.md`). A location outside this package's own tree would
 * not resolve it, for the same structural reason.
 */

const TMP_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'tmp')

const RENDER_MODULE = `
import { h } from '@cogenta/theme-kit'
export function renderPage(page) {
  return h('main', { class: 'cg-main' }, h('h1', {}, page.title))
}
export function renderChrome() {
  return { header: '<header>Fixture header</header>', footer: '<footer>Fixture footer</footer>' }
}
`

const THROWING_RENDER_MODULE = `
export function renderPage() { throw new Error('fixture render failure') }
export function renderChrome() { return { header: '', footer: '' } }
`

// The full contract B vocabulary (`@cogenta/blocks`'s `VOCABULARY_NAMES`),
// hardcoded rather than imported — same reasoning `theme-registry-filesystem.
// test.ts` already documents: a fixture theme lives outside this monorepo's
// own `node_modules` resolution for the manifest's own purposes, and
// `verifyTheme` (task 1, exercised for real by `checkThemeDeployment`)
// refuses a manifest that does not cover it.
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

const VALID_MANIFEST = `
export default {
  name: 'deployable-theme',
  version: '1.0.0',
  engine: '^1.0.0',
  blocks: '^1.0.0',
  implements: ${JSON.stringify(FULL_VOCABULARY)},
  collections: '*',
  runtime: 'server',
  tokens: 'theme.tokens.json',
  description: 'A theme built for the deploy pipeline suite.',
  author: 'A developer, not an agent',
}
`

const INCOMPLETE_MANIFEST = `
export default {
  name: 'deployable-theme',
  version: '1.0.0',
  engine: '^1.0.0',
  blocks: '^1.0.0',
  implements: [],
  collections: '*',
  runtime: 'server',
  tokens: 'theme.tokens.json',
  description: 'Missing every block on purpose.',
  author: 'A developer, not an agent',
}
`

const FORBIDDEN_IMPORT_RENDER_MODULE = `
import { readFileSync } from 'node:fs'
export function renderPage() { readFileSync('/etc/passwd'); return { tag: 'main', attrs: {}, children: [] } }
export function renderChrome() { return { header: '', footer: '' } }
`

async function makeProjectRoot(): Promise<string> {
  await mkdir(TMP_ROOT, { recursive: true })
  return mkdtemp(join(TMP_ROOT, 'project-'))
}

describe('theme sandbox (fiche 73 task 4)', () => {
  const roots: string[] = []

  afterEach(async () => {
    while (roots.length > 0) {
      const root = roots.pop()
      if (root !== undefined) await rm(root, { recursive: true, force: true })
    }
  })

  it('creates a fresh, empty sandbox directory outside themes/', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const dir = await createSandbox(root, 'my-new-theme')
    expect(dir).toBe(sandboxDirectory(root, 'my-new-theme'))
    expect(dir).not.toContain(join('themes', 'my-new-theme'))
    // Idempotent — re-creating the same id is not an error.
    await expect(createSandbox(root, 'my-new-theme')).resolves.toBe(dir)
  })

  it('lists sandbox ids currently on disk, empty when none exist yet', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    expect(await listSandboxIds(root)).toEqual([])
    await createSandbox(root, 'alpha')
    await createSandbox(root, 'beta')
    const ids = await listSandboxIds(root)
    expect([...ids].sort()).toEqual(['alpha', 'beta'])
  })

  it('clones a real, installed local theme into the sandbox as real files, not a link', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const themeDir = join(root, 'themes', 'existing-theme')
    await mkdir(themeDir, { recursive: true })
    await writeFile(join(themeDir, 'theme.render.mjs'), RENDER_MODULE, 'utf8')
    await writeFile(join(themeDir, 'marker.txt'), 'original', 'utf8')

    const sandboxDir = await cloneThemeIntoSandbox(root, 'existing-theme', 'customised')
    const clonedMarker = await readFile(join(sandboxDir, 'marker.txt'), 'utf8')
    expect(clonedMarker).toBe('original')

    // A real copy, not a link: editing the clone must never touch the source.
    await writeFile(join(sandboxDir, 'marker.txt'), 'edited in sandbox', 'utf8')
    const sourceMarker = await readFile(join(themeDir, 'marker.txt'), 'utf8')
    expect(sourceMarker).toBe('original')
  })

  it('refuses to clone a theme that has no folder in themes/ — a built-in, npm-packaged theme has no source to copy', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    await expect(cloneThemeIntoSandbox(root, 'canonical', 'x')).rejects.toMatchObject({
      code: 'THEME_SANDBOX_SOURCE_NOT_FOUND',
    })
  })

  it('reports a clear error, not a crash, when the sandbox has no render module yet', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    await createSandbox(root, 'empty')
    const result = await renderSandboxPreview({ projectRoot: root, id: 'empty' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('nothing to preview')
  })

  it('renders the sandbox theme end to end through a real isolated worker', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const dir = await createSandbox(root, 'preview-me')
    await writeFile(join(dir, 'theme.render.mjs'), RENDER_MODULE, 'utf8')

    const result = await renderSandboxPreview({
      projectRoot: root,
      id: 'preview-me',
      siteName: 'My Test Site',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.html).toContain('<header>Fixture header</header>')
      expect(result.html).toContain('<footer>Fixture footer</footer>')
      expect(result.html).toContain('A site that looks like yours')
      expect(result.html).toContain('My Test Site — sandbox preview')
    }
  })

  it('reports the render error rather than crashing the host when the sandbox theme throws', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const dir = await createSandbox(root, 'broken')
    await writeFile(join(dir, 'theme.render.mjs'), THROWING_RENDER_MODULE, 'utf8')

    const result = await renderSandboxPreview({ projectRoot: root, id: 'broken' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('fixture render failure')
  })

  it('re-reads the sandbox directory on every call — an edit between two previews is picked up with no reload step', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const dir = await createSandbox(root, 'live-edit')
    await writeFile(join(dir, 'theme.render.mjs'), RENDER_MODULE, 'utf8')

    const first = await renderSandboxPreview({ projectRoot: root, id: 'live-edit' })
    expect(first.ok).toBe(true)

    await writeFile(join(dir, 'theme.render.mjs'), THROWING_RENDER_MODULE, 'utf8')
    const second = await renderSandboxPreview({ projectRoot: root, id: 'live-edit' })
    expect(second.ok).toBe(false)
  })
})

describe('theme deploy pipeline (fiche 73 task 5)', () => {
  const roots: string[] = []

  afterEach(async () => {
    while (roots.length > 0) {
      const root = roots.pop()
      if (root !== undefined) await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses to deploy a sandbox with no render module, and touches nothing in themes/', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    await createSandbox(root, 'empty')

    const check = await checkThemeDeployment(root, 'empty', 'my-theme')
    expect(check.ok).toBe(false)
    expect(check.reasons[0]).toContain('nothing to deploy')

    const result = await deployThemeFromSandbox(root, 'empty', 'my-theme')
    expect(result.ok).toBe(false)
    await expect(
      readFile(join(root, 'themes', 'my-theme', 'theme.config.mjs'), 'utf8'),
    ).rejects.toThrow()
  })

  it('refuses to deploy a theme missing vocabulary blocks — the same rule a built-in theme already meets', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const dir = await createSandbox(root, 'incomplete')
    await writeFile(join(dir, 'theme.config.mjs'), INCOMPLETE_MANIFEST, 'utf8')
    await writeFile(join(dir, 'theme.render.mjs'), RENDER_MODULE, 'utf8')

    const check = await checkThemeDeployment(root, 'incomplete', 'my-theme')
    expect(check.ok).toBe(false)
    expect(check.reasons[0]).toContain('does not implement every block')
  })

  it('refuses to deploy a theme with a forbidden import — never copies it into themes/', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const dir = await createSandbox(root, 'forbidden')
    await writeFile(join(dir, 'theme.config.mjs'), VALID_MANIFEST, 'utf8')
    await writeFile(join(dir, 'theme.render.mjs'), FORBIDDEN_IMPORT_RENDER_MODULE, 'utf8')

    const check = await checkThemeDeployment(root, 'forbidden', 'my-theme')
    expect(check.ok).toBe(false)
    expect(check.reasons[0]).toContain('node:fs')

    const result = await deployThemeFromSandbox(root, 'forbidden', 'my-theme')
    expect(result.ok).toBe(false)
    await expect(
      readFile(join(root, 'themes', 'my-theme', 'theme.config.mjs'), 'utf8'),
    ).rejects.toThrow()
  })

  it('deploys a valid sandbox theme into themes/<name>/, without its own disposable preview adapter', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const dir = await createSandbox(root, 'ready')
    await writeFile(join(dir, 'theme.config.mjs'), VALID_MANIFEST, 'utf8')
    await writeFile(join(dir, 'theme.render.mjs'), RENDER_MODULE, 'utf8')
    // A stray preview adapter, as if a preview had been requested earlier —
    // it must never end up inside the deployed theme.
    await renderSandboxPreview({ projectRoot: root, id: 'ready' })

    const check = await checkThemeDeployment(root, 'ready', 'my-first-theme')
    expect(check.ok).toBe(true)

    const result = await deployThemeFromSandbox(root, 'ready', 'my-first-theme')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.previousVersionDirectory).toBeNull()
      const manifest = await readFile(join(result.themeDirectory, 'theme.config.mjs'), 'utf8')
      expect(manifest).toContain('deployable-theme')
      await expect(
        readFile(join(result.themeDirectory, '.cogenta-preview-adapter.mjs'), 'utf8'),
      ).rejects.toThrow()
    }
  })

  it('archives the previous version, timestamped, on a redeploy — never overwritten in place', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const dir = await createSandbox(root, 'v1')
    await writeFile(join(dir, 'theme.config.mjs'), VALID_MANIFEST, 'utf8')
    await writeFile(join(dir, 'theme.render.mjs'), RENDER_MODULE, 'utf8')
    const first = await deployThemeFromSandbox(root, 'v1', 'redeployed-theme')
    expect(first.ok).toBe(true)

    const dir2 = await createSandbox(root, 'v2')
    const updatedManifest = VALID_MANIFEST.replace(
      'A theme built for the deploy pipeline suite.',
      'A second, updated version.',
    )
    await writeFile(join(dir2, 'theme.config.mjs'), updatedManifest, 'utf8')
    await writeFile(join(dir2, 'theme.render.mjs'), RENDER_MODULE, 'utf8')
    const second = await deployThemeFromSandbox(root, 'v2', 'redeployed-theme')
    expect(second.ok).toBe(true)
    if (second.ok) {
      expect(second.previousVersionDirectory).not.toBeNull()
      const archivedManifest =
        second.previousVersionDirectory === null
          ? ''
          : await readFile(join(second.previousVersionDirectory, 'theme.config.mjs'), 'utf8')
      expect(archivedManifest).toContain('A theme built for the deploy pipeline suite.')

      const currentManifest = await readFile(
        join(second.themeDirectory, 'theme.config.mjs'),
        'utf8',
      )
      expect(currentManifest).toContain('A second, updated version.')
    }
  })

  it('re-checks right before deploying — a sandbox that becomes invalid between the check and the confirm click is still refused', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const dir = await createSandbox(root, 'goes-bad')
    await writeFile(join(dir, 'theme.config.mjs'), VALID_MANIFEST, 'utf8')
    await writeFile(join(dir, 'theme.render.mjs'), RENDER_MODULE, 'utf8')

    const check = await checkThemeDeployment(root, 'goes-bad', 'stale-check-theme')
    expect(check.ok).toBe(true)

    // The sandbox changes after the check ran but before deploy is called —
    // the same real-world gap a human clicking "confirm" leaves open.
    await writeFile(join(dir, 'theme.render.mjs'), FORBIDDEN_IMPORT_RENDER_MODULE, 'utf8')

    const result = await deployThemeFromSandbox(root, 'goes-bad', 'stale-check-theme')
    expect(result.ok).toBe(false)
  })
})
