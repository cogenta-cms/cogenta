import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  checkThemeDeployment,
  cloneThemeIntoSandbox,
  createSandbox,
  deleteSandboxFile,
  deleteTheme,
  deployThemeFromSandbox,
  listSandboxIds,
  listThemeVersions,
  renderSandboxPreview,
  restoreThemeVersion,
  sandboxDirectory,
  writeSandboxFile,
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

  // Product decision: a theme has the same design freedom a WordPress theme
  // or a Strapi frontend already has, including a custom block vocabulary —
  // missing coverage of the shared vocabulary no longer blocks a deploy.
  it('deploys a theme missing vocabulary blocks — a custom block vocabulary is not a deploy blocker', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const dir = await createSandbox(root, 'incomplete')
    await writeFile(join(dir, 'theme.config.mjs'), INCOMPLETE_MANIFEST, 'utf8')
    await writeFile(join(dir, 'theme.render.mjs'), RENDER_MODULE, 'utf8')

    const check = await checkThemeDeployment(root, 'incomplete', 'my-theme')
    expect(check.ok).toBe(true)
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

  // Fiche 73 task 7's own live E2E test: a real agent fixed an invalid
  // manifest, but a second check in the same long-running `cogenta serve`
  // process kept reporting the original failure — `loadTheme`'s default
  // `importManifest` has no cache-busting, so Node's own ESM cache silently
  // served the *first* import of this path forever. The opposite direction
  // of the test above: a sandbox that becomes VALID between two checks must
  // be reported valid, not stuck on its first, since-fixed failure.
  it('re-checks correctly after a fix — a sandbox that becomes valid between two checks in the same process is reported valid', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const dir = await createSandbox(root, 'gets-fixed')
    // Genuinely invalid (runtime is not one of the three literal strings) —
    // missing block-vocabulary coverage is no longer a failure to fix here.
    const invalidRuntimeManifest = VALID_MANIFEST.replace("runtime: 'server'", 'runtime: 123')
    await writeFile(join(dir, 'theme.config.mjs'), invalidRuntimeManifest, 'utf8')
    await writeFile(join(dir, 'theme.render.mjs'), RENDER_MODULE, 'utf8')

    const first = await checkThemeDeployment(root, 'gets-fixed', 'was-incomplete-theme')
    expect(first.ok).toBe(false)

    // Same path, fixed content — the same real-world shape as an agent
    // retrying `theme.write_sandbox_file` after reading a rejection.
    await writeFile(join(dir, 'theme.config.mjs'), VALID_MANIFEST, 'utf8')

    const second = await checkThemeDeployment(root, 'gets-fixed', 'was-incomplete-theme')
    expect(second.ok).toBe(true)
  })
})

describe('theme versions (fiche 73 task 6)', () => {
  const roots: string[] = []

  afterEach(async () => {
    while (roots.length > 0) {
      const root = roots.pop()
      if (root !== undefined) await rm(root, { recursive: true, force: true })
    }
  })

  it('lists no versions for a theme that has never been redeployed or restored', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    expect(await listThemeVersions(root, 'never-touched')).toEqual([])
  })

  it('archives each prior deploy, listed newest first', async () => {
    const root = await makeProjectRoot()
    roots.push(root)

    const dir1 = await createSandbox(root, 'v1')
    await writeFile(join(dir1, 'theme.config.mjs'), VALID_MANIFEST, 'utf8')
    await writeFile(join(dir1, 'theme.render.mjs'), RENDER_MODULE, 'utf8')
    await deployThemeFromSandbox(root, 'v1', 'versioned-theme')
    expect(await listThemeVersions(root, 'versioned-theme')).toEqual([])

    const dir2 = await createSandbox(root, 'v2')
    await writeFile(join(dir2, 'theme.config.mjs'), VALID_MANIFEST, 'utf8')
    await writeFile(join(dir2, 'theme.render.mjs'), RENDER_MODULE, 'utf8')
    await deployThemeFromSandbox(root, 'v2', 'versioned-theme')

    const dir3 = await createSandbox(root, 'v3')
    await writeFile(join(dir3, 'theme.config.mjs'), VALID_MANIFEST, 'utf8')
    await writeFile(join(dir3, 'theme.render.mjs'), RENDER_MODULE, 'utf8')
    await deployThemeFromSandbox(root, 'v3', 'versioned-theme')

    const versions = await listThemeVersions(root, 'versioned-theme')
    expect(versions).toHaveLength(2)
    // Newest first — the version created by the *last* redeploy comes first.
    const [newest, oldest] = versions
    expect(
      newest !== undefined && oldest !== undefined && newest.timestamp >= oldest.timestamp,
    ).toBe(true)
  })

  it('restores an archived version over themes/<name>/, archiving the version it replaces in turn', async () => {
    const root = await makeProjectRoot()
    roots.push(root)

    const dir1 = await createSandbox(root, 'v1')
    await writeFile(join(dir1, 'theme.config.mjs'), VALID_MANIFEST, 'utf8')
    await writeFile(join(dir1, 'theme.render.mjs'), RENDER_MODULE, 'utf8')
    await deployThemeFromSandbox(root, 'v1', 'restorable-theme')

    const dir2 = await createSandbox(root, 'v2')
    const updatedManifest = VALID_MANIFEST.replace(
      'A theme built for the deploy pipeline suite.',
      'The second, current version.',
    )
    await writeFile(join(dir2, 'theme.config.mjs'), updatedManifest, 'utf8')
    await writeFile(join(dir2, 'theme.render.mjs'), RENDER_MODULE, 'utf8')
    await deployThemeFromSandbox(root, 'v2', 'restorable-theme')

    const versions = await listThemeVersions(root, 'restorable-theme')
    expect(versions).toHaveLength(1) // the archived v1

    const restore = await restoreThemeVersion(
      root,
      'restorable-theme',
      versions[0]?.timestamp ?? '',
    )
    expect(restore.ok).toBe(true)
    if (restore.ok) {
      expect(restore.archivedCurrentDirectory).not.toBeNull()
      const restoredManifest = await readFile(
        join(restore.themeDirectory, 'theme.config.mjs'),
        'utf8',
      )
      expect(restoredManifest).toContain('A theme built for the deploy pipeline suite.')
    }

    // The restore is itself undoable: the version it replaced (v2) is now archived too.
    const versionsAfterRestore = await listThemeVersions(root, 'restorable-theme')
    expect(versionsAfterRestore).toHaveLength(2)
  })

  it('refuses to restore a version id that does not exist, without touching the active theme', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const dir = await createSandbox(root, 'only-version')
    await writeFile(join(dir, 'theme.config.mjs'), VALID_MANIFEST, 'utf8')
    await writeFile(join(dir, 'theme.render.mjs'), RENDER_MODULE, 'utf8')
    await deployThemeFromSandbox(root, 'only-version', 'lonely-theme')

    const result = await restoreThemeVersion(root, 'lonely-theme', 'not-a-real-timestamp')
    expect(result.ok).toBe(false)

    const manifest = await readFile(
      join(root, 'themes', 'lonely-theme', 'theme.config.mjs'),
      'utf8',
    )
    expect(manifest).toContain('deployable-theme')
  })
})

describe('deleting a theme (fiche "supprimer un thème")', () => {
  const roots: string[] = []

  afterEach(async () => {
    while (roots.length > 0) {
      const root = roots.pop()
      if (root !== undefined) await rm(root, { recursive: true, force: true })
    }
  })

  it('removes a deployed theme entirely — nothing left under themes/<name>/', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const dir = await createSandbox(root, 'to-delete')
    await writeFile(join(dir, 'theme.config.mjs'), VALID_MANIFEST, 'utf8')
    await writeFile(join(dir, 'theme.render.mjs'), RENDER_MODULE, 'utf8')
    await deployThemeFromSandbox(root, 'to-delete', 'deletable-theme')

    const result = await deleteTheme(root, 'deletable-theme')
    expect(result.ok).toBe(true)
    await expect(
      readFile(join(root, 'themes', 'deletable-theme', 'theme.config.mjs'), 'utf8'),
    ).rejects.toThrow()
  })

  // The whole point the admin's own warning names: a deleted theme really
  // disappears, not just "until someone restores an old version" — its
  // archive must go with it, or `restoreThemeVersion` could bring back a
  // theme the operator just asked to delete entirely.
  it('also removes every archived version — a deleted theme cannot be brought back by restoring', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const dir1 = await createSandbox(root, 'v1')
    await writeFile(join(dir1, 'theme.config.mjs'), VALID_MANIFEST, 'utf8')
    await writeFile(join(dir1, 'theme.render.mjs'), RENDER_MODULE, 'utf8')
    await deployThemeFromSandbox(root, 'v1', 'versioned-deletable-theme')

    const dir2 = await createSandbox(root, 'v2')
    await writeFile(join(dir2, 'theme.config.mjs'), VALID_MANIFEST, 'utf8')
    await writeFile(join(dir2, 'theme.render.mjs'), RENDER_MODULE, 'utf8')
    await deployThemeFromSandbox(root, 'v2', 'versioned-deletable-theme')
    expect(await listThemeVersions(root, 'versioned-deletable-theme')).toHaveLength(1)

    const result = await deleteTheme(root, 'versioned-deletable-theme')
    expect(result.ok).toBe(true)
    expect(await listThemeVersions(root, 'versioned-deletable-theme')).toEqual([])
  })

  it('refuses a name with no real folder under themes/, rather than silently doing nothing', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const result = await deleteTheme(root, 'never-deployed')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reasons.join(' ')).toContain('never-deployed')
  })

  it('never touches a built-in theme name — there is no folder for it to find', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const result = await deleteTheme(root, '@cogenta/theme-canonical')
    expect(result.ok).toBe(false)
  })
})

describe('writing a single sandbox file (fiche 73 task 7)', () => {
  const roots: string[] = []

  afterEach(async () => {
    while (roots.length > 0) {
      const root = roots.pop()
      if (root !== undefined) await rm(root, { recursive: true, force: true })
    }
  })

  it('writes a file into a sandbox it also creates on first write', async () => {
    const root = await makeProjectRoot()
    roots.push(root)

    const result = await writeSandboxFile(root, 'fresh', 'theme.config.mjs', VALID_MANIFEST)
    expect(result.path).toBe('theme.config.mjs')

    const content = await readFile(
      join(sandboxDirectory(root, 'fresh'), 'theme.config.mjs'),
      'utf8',
    )
    expect(content).toBe(VALID_MANIFEST)
  })

  // Fiche 73 task 7's own live E2E test: a real model asked to write
  // theme.config.mjs invented a manifest shape that looks plausible but
  // isn't — `blocks` as a list of block names instead of the block-vocabulary
  // semver range it actually is, `runtime` as an object instead of one of
  // three literal strings, `tokens` as inline data instead of a path string.
  // This must be rejected at write time, with the real field-by-field error,
  // not shipped into the sandbox to fail silently at preview or deploy.
  it('refuses a theme.config.* whose manifest fields have the wrong shape', async () => {
    const root = await makeProjectRoot()
    roots.push(root)

    const hallucinatedManifest = `
export default {
  name: 'hallucinated-theme',
  version: '0.1.0',
  engine: 'cogenta:theme-engine',
  blocks: ['hero', 'recentPosts'],
  implements: ['theme.skin', 'layout.blog'],
  collections: ['posts'],
  runtime: { apiVersion: 1 },
  tokens: { color: { bg: '#fff' } },
}
`
    await expect(
      writeSandboxFile(root, 'hallucinated', 'theme.config.mjs', hallucinatedManifest),
    ).rejects.toMatchObject({ code: 'THEME_SANDBOX_FILE_INVALID' })

    await expect(
      readFile(join(sandboxDirectory(root, 'hallucinated'), 'theme.config.mjs'), 'utf8'),
    ).rejects.toThrow()
  })

  it('restores the previous content when a rewrite of an existing file fails validation', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    await writeSandboxFile(root, 'rewritten', 'theme.config.mjs', VALID_MANIFEST)

    await expect(
      writeSandboxFile(root, 'rewritten', 'theme.config.mjs', 'export default { name: 1 }'),
    ).rejects.toMatchObject({ code: 'THEME_SANDBOX_FILE_INVALID' })

    const content = await readFile(
      join(sandboxDirectory(root, 'rewritten'), 'theme.config.mjs'),
      'utf8',
    )
    expect(content).toBe(VALID_MANIFEST)
  })

  // Live-observed real agent mistake: a model asked to write theme.render.*
  // named the file theme.render.tsx — plausible-sounding, but this sandbox
  // has no build step (a plain ESM import()), which cannot transform JSX.
  // Before this guard, the write silently succeeded (neither the config nor
  // the render regex matches ".tsx") and the file was never found by the
  // preview/deploy pipeline at all, with no error pointing back at why.
  it('refuses theme.render.tsx and theme.config.tsx by name, with a corrective hint about JSX', async () => {
    const root = await makeProjectRoot()
    roots.push(root)

    await expect(
      writeSandboxFile(root, 'jsx-render', 'theme.render.tsx', 'export function renderPage() {}'),
    ).rejects.toMatchObject({ code: 'THEME_SANDBOX_FILE_INVALID' })
    await expect(
      readFile(join(sandboxDirectory(root, 'jsx-render'), 'theme.render.tsx'), 'utf8'),
    ).rejects.toThrow()

    await expect(
      writeSandboxFile(root, 'jsx-config', 'theme.config.tsx', 'export default {}'),
    ).rejects.toMatchObject({ code: 'THEME_SANDBOX_FILE_INVALID' })
  })

  it('refuses a theme.render.* that does not export renderPage and renderChrome', async () => {
    const root = await makeProjectRoot()
    roots.push(root)

    await expect(
      writeSandboxFile(root, 'no-exports', 'theme.render.mjs', 'export const notAFunction = 1'),
    ).rejects.toMatchObject({ code: 'THEME_SANDBOX_FILE_INVALID' })
  })

  // The exact live failure fiche 73's own E2E test found: a model wrote a
  // theme.render.mjs exporting two real functions (passing the shallow
  // "are these exports callable" check) that each returned a plain data
  // object instead of an HtmlElement built with h() — a shape `serialize()`
  // cannot handle, which used to only ever surface at the next preview
  // click, disconnected from the write that caused it.
  it('refuses a theme.render.* whose functions return the wrong shape, even though both exist', async () => {
    const root = await makeProjectRoot()
    roots.push(root)

    const wrongShapeRenderModule = `
export function renderPage(page) {
  return { title: page.title, hero: { wordmark: 'BLOG' } }
}
export function renderChrome() {
  return { site: { name: 'x' }, header: { text: 'hi' } }
}
`
    await expect(
      writeSandboxFile(root, 'wrong-shape', 'theme.render.mjs', wrongShapeRenderModule),
    ).rejects.toMatchObject({ code: 'THEME_SANDBOX_FILE_INVALID' })

    await expect(
      readFile(join(sandboxDirectory(root, 'wrong-shape'), 'theme.render.mjs'), 'utf8'),
    ).rejects.toThrow()
  })

  it('accepts a well-formed theme.render.* module', async () => {
    const root = await makeProjectRoot()
    roots.push(root)

    const result = await writeSandboxFile(root, 'well-formed', 'theme.render.mjs', RENDER_MODULE)
    expect(result.path).toBe('theme.render.mjs')
  })

  it('creates intermediate subdirectories a nested path names', async () => {
    const root = await makeProjectRoot()
    roots.push(root)

    await writeSandboxFile(root, 'nested', 'blocks/hero.mjs', 'export const hero = 1')
    const content = await readFile(
      join(sandboxDirectory(root, 'nested'), 'blocks', 'hero.mjs'),
      'utf8',
    )
    expect(content).toBe('export const hero = 1')
  })

  it('refuses a path that escapes the sandbox with "../", never writing outside it', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    await createSandbox(root, 'contained')

    await expect(
      writeSandboxFile(root, 'contained', '../../escaped.txt', 'malicious'),
    ).rejects.toMatchObject({ code: 'THEME_SANDBOX_PATH_ESCAPE' })

    await expect(readFile(join(root, 'escaped.txt'), 'utf8')).rejects.toThrow()
  })

  it('refuses an absolute path, same guard as a relative escape', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    await createSandbox(root, 'contained-2')

    await expect(
      writeSandboxFile(root, 'contained-2', join(root, 'themes', 'evil.mjs'), 'malicious'),
    ).rejects.toMatchObject({ code: 'THEME_SANDBOX_PATH_ESCAPE' })
  })

  it("refuses to overwrite the sandbox's own reserved preview-adapter file", async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    await createSandbox(root, 'reserved')

    await expect(
      writeSandboxFile(root, 'reserved', '.cogenta-preview-adapter.mjs', 'anything'),
    ).rejects.toMatchObject({ code: 'THEME_SANDBOX_PATH_ESCAPE' })
  })

  // Security review, fiche 73 task 7 — the reserved-file guard originally
  // compared the raw string, so a differently-spelled equivalent path (a
  // leading "./", here) that resolves to the exact same file slipped past
  // it. Fixed to compare resolved paths instead; this is the regression test.
  it('refuses the reserved preview-adapter file under an equivalent, differently-spelled path too', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    await createSandbox(root, 'reserved-variant')

    await expect(
      writeSandboxFile(root, 'reserved-variant', './.cogenta-preview-adapter.mjs', 'anything'),
    ).rejects.toMatchObject({ code: 'THEME_SANDBOX_PATH_ESCAPE' })
  })

  // Security review, fiche 73 task 7 — a lexical path check alone cannot
  // see a symlink already sitting inside the sandbox (e.g. carried in by
  // cloneThemeIntoSandbox, which copies a symlink as a symlink). This
  // proves the real-filesystem half of the guard actually stops a write
  // that would otherwise land outside the sandbox by following that link.
  it('refuses to write through a symlink inside the sandbox that points outside it', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    const outsideDir = await mkdtemp(join(TMP_ROOT, 'outside-'))
    roots.push(outsideDir)
    const dir = await createSandbox(root, 'symlinked')

    try {
      await symlink(outsideDir, join(dir, 'escape-link'), 'junction')
    } catch {
      // Creating a symlink/junction can be unprivileged-blocked in some CI
      // environments — skip rather than fail the suite on an environment
      // limitation unrelated to the guard itself.
      return
    }

    await expect(
      writeSandboxFile(root, 'symlinked', 'escape-link/evil.mjs', 'malicious'),
    ).rejects.toMatchObject({ code: 'THEME_SANDBOX_PATH_ESCAPE' })
    await expect(readFile(join(outsideDir, 'evil.mjs'), 'utf8')).rejects.toThrow()
  })

  it('deletes a file it previously wrote — the tool revert path', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    await writeSandboxFile(root, 'to-delete', 'theme.render.mjs', RENDER_MODULE)

    await deleteSandboxFile(root, 'to-delete', 'theme.render.mjs')

    await expect(
      readFile(join(sandboxDirectory(root, 'to-delete'), 'theme.render.mjs'), 'utf8'),
    ).rejects.toThrow()
  })

  it('deleting an already-absent file succeeds — reverting twice is not an error', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    await createSandbox(root, 'idempotent-delete')

    await expect(
      deleteSandboxFile(root, 'idempotent-delete', 'never-written.mjs'),
    ).resolves.toBeUndefined()
  })

  it('a file written by the agent tool is picked up by the next preview, end to end', async () => {
    const root = await makeProjectRoot()
    roots.push(root)
    await writeSandboxFile(root, 'agent-written', 'theme.render.mjs', RENDER_MODULE)

    const result = await renderSandboxPreview({ projectRoot: root, id: 'agent-written' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.html).toContain('<header>Fixture header</header>')
  })
})
