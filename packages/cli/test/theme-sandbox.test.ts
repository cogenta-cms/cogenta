import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  cloneThemeIntoSandbox,
  createSandbox,
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
