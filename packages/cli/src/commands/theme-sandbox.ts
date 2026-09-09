import { randomUUID } from 'node:crypto'
import { access, cp, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CogentaError } from '@cogenta/core'
import { runIsolatedModule } from '@cogenta/plugins'
import { loadTheme, parseThemeManifest, renderSkin } from '@cogenta/render'
import { escapeText } from '@cogenta/theme-kit'
import { invalidateThemeCss, loadLocalThemeCss } from './theme-css.js'
import { invalidateFilesystemTheme } from './theme-registry.js'

/**
 * Fiche 73 tasks 4-7 — the sandbox itself (create, clone, isolated preview —
 * task 4), the deploy pipeline that promotes one into `themes/<name>/`
 * (task 5, § 3.4), its version history (task 6, § 3.5), and single-file
 * writes into a sandbox (task 7, § 3.6) — the primitive both the AI agent's
 * `theme.write_sandbox_file` tool and, later, any other writer call into.
 */

const SANDBOX_DIRECTORY = join('.cogenta', 'theme-sandbox')
const RENDER_MODULE_CANDIDATES = ['theme.render.js', 'theme.render.mjs', 'theme.render.ts'] as const
const PREVIEW_ADAPTER_FILE = '.cogenta-preview-adapter.mjs'

/** `<projectRoot>/.cogenta/theme-sandbox/<id>/` — never inside `themes/` itself (§ 3.3). */
export function sandboxDirectory(projectRoot: string, id: string): string {
  return join(projectRoot, SANDBOX_DIRECTORY, id)
}

/** A fresh, empty working directory — the "new theme" case (§ 3.3). Idempotent: re-running against an already-created id is a no-op, not an error. */
export async function createSandbox(projectRoot: string, id: string): Promise<string> {
  const dir = sandboxDirectory(projectRoot, id)
  await mkdir(dir, { recursive: true })
  return dir
}

/**
 * The "customise an existing theme" case (§ 3.3): a real, recursive file
 * copy from `themes/<themeName>/` into the sandbox — never a symlink or a
 * junction (piège n°2: this session runs on Windows, where a link-based
 * "clone" behaves differently across platforms; `fs.cp` with `recursive`
 * copies real file contents by default, which is the one behaviour that is
 * identical everywhere). The installed theme itself is never opened for
 * writing by this function.
 *
 * Only a theme already sitting in this project's own `themes/` folder can be
 * cloned this way — a built-in, npm-packaged theme (`@cogenta/theme-canonical`
 * and the rest) has no folder here to copy from. Cloning one of those is an
 * honest gap, not silently pretended to work: it fails with a clear,
 * actionable error rather than copying nothing and calling it done.
 */
export async function cloneThemeIntoSandbox(
  projectRoot: string,
  themeName: string,
  id: string,
): Promise<string> {
  const source = join(projectRoot, 'themes', themeName)
  try {
    await access(source)
  } catch {
    throw new CogentaError({
      code: 'THEME_SANDBOX_SOURCE_NOT_FOUND',
      message: `No local theme named "${themeName}" exists in this project's themes/ folder to clone.`,
      hint: 'Only a theme already dropped into themes/ can be customised this way. A built-in theme has no folder here yet.',
      details: { themeName },
    })
  }
  const dir = sandboxDirectory(projectRoot, id)
  await mkdir(dir, { recursive: true })
  await cp(source, dir, { recursive: true })
  return dir
}

async function findRenderModuleFile(dir: string): Promise<string | undefined> {
  for (const candidate of RENDER_MODULE_CANDIDATES) {
    try {
      await access(join(dir, candidate))
      return candidate
    } catch {
      // Not this candidate — try the next, same order theme-registry.ts's
      // own filesystem theme lookup already uses.
    }
  }
  return undefined
}

/**
 * The adapter this preview actually runs inside the isolated worker — not
 * the sandbox's own `theme.render.*` directly. `runIsolatedModule` (fiche 73
 * task 3) hands a module's export exactly one flat, RPC-backed callback
 * object as its last argument; a theme's real `renderPage(page, ctx, ...)`
 * expects a shaped `RenderContext`, not that flat object. This tiny file,
 * regenerated fresh before every preview call (never committed, never
 * reused across calls, entirely disposable), is what reshapes one into the
 * other — written to disk because `runIsolatedModule`'s guest does a real
 * `import()`, which needs a real file to import, exactly like the sandbox's
 * own render module does.
 */
function buildPreviewAdapterSource(renderModuleFile: string): string {
  const specifier = `./${renderModuleFile}`
  return `import * as theme from ${JSON.stringify(specifier)}
import { serialize } from '@cogenta/theme-kit'

export async function renderPreview(page, chromeInput, callbacks) {
  const ctx = {
    site: chromeInput.site,
    locale: chromeInput.locale,
    url: new URL('/', chromeInput.site.url),
    t: (key, values) => callbacks.t(key, values),
    image: (media, options) => callbacks.image(media, options),
    link: (target) => callbacks.link(target),
    content: {
      entry: (collection, id) => callbacks['content.entry'](collection, id),
      byPath: (path) => callbacks['content.byPath'](path),
      list: (request) => callbacks['content.list'](request),
    },
  }
  const body = serialize(theme.renderPage(page, ctx, {}))
  const chrome = theme.renderChrome(chromeInput)
  return { header: chrome.header, body, footer: chrome.footer }
}
`
}

/** A short, fixed page — same reasoning `renderThemeGalleryPreview` already documents: every preview must show the same content, database-free, so nothing here can leak a real entry and comparing two edits of the same sandbox stays fair. */
function previewDemoPage(): unknown {
  return {
    title: 'A site that looks like yours',
    blocks: [
      {
        _key: 'sandbox-preview-hero',
        _type: 'hero',
        _version: '1.0.0',
        eyebrow: 'Sandbox preview',
        title: 'A site that looks like yours',
        subtitle:
          'Unsaved changes from the sandbox, rendered exactly as they would appear once deployed.',
        actions: [{ label: 'Get started', target: { href: '#' }, emphasis: 'primary' }],
      },
    ],
  }
}

function previewDemoChromeInput(siteName: string): unknown {
  return {
    site: {
      name: siteName,
      url: 'http://sandbox-preview.invalid/',
      locales: ['en'],
      defaultLocale: 'en',
    },
    locale: 'en',
    homeHref: '/',
    headerNav: [{ label: 'Home', href: '/', openInNewTab: false, kind: 'url', title: null }],
    footerNav: [],
    brandingHtml: '',
  }
}

export interface SandboxPreviewOptions {
  readonly projectRoot: string
  readonly id: string
  readonly siteName?: string
  readonly timeoutMs?: number
}

export type SandboxPreviewResult =
  | { readonly ok: true; readonly html: string }
  | { readonly ok: false; readonly error: string }

/**
 * Renders the sandbox's current, on-disk state through a real isolated
 * worker (`runIsolatedModule`) — never in the `cogenta serve` process itself
 * (§ 3.3), and never gated on `verifyTheme`'s security scan the way a
 * deployment is (task 5's job, not this one): a preview is explicitly meant
 * to show in-progress, possibly-invalid-for-deployment code as it actually
 * behaves. The isolation this gets is `runIsolatedModule`'s own documented
 * guarantee — worker-level (`env: {}`, bounded memory, a timeout), NOT a
 * `vm` boundary against a forbidden import (fiche 73 task 3's own doc
 * comment, ADR-0034's "point de vigilance"). Every call re-reads the
 * directory as it is right now — no reload daemon, since a preview is one
 * explicit click, never a continuous stream (§ 3.3).
 */
export async function renderSandboxPreview(
  options: SandboxPreviewOptions,
): Promise<SandboxPreviewResult> {
  const dir = sandboxDirectory(options.projectRoot, options.id)
  const renderModuleFile = await findRenderModuleFile(dir)
  if (renderModuleFile === undefined) {
    return {
      ok: false,
      error: `This sandbox has no theme.render.{js,mjs,ts} yet — nothing to preview.`,
    }
  }

  await writeFile(
    join(dir, PREVIEW_ADAPTER_FILE),
    buildPreviewAdapterSource(renderModuleFile),
    'utf8',
  )

  const siteName = options.siteName ?? 'Preview'
  const result = await runIsolatedModule({
    moduleUrl: pathToFileURL(join(dir, PREVIEW_ADAPTER_FILE)),
    exportName: 'renderPreview',
    args: [previewDemoPage(), previewDemoChromeInput(siteName)],
    callbacks: {
      t: (args) => (typeof args[0] === 'string' ? args[0] : ''),
      image: () => {
        throw new CogentaError({
          code: 'THEME_SANDBOX_IMAGE_UNSUPPORTED',
          message: 'The sandbox preview renders fixed, image-free demo content by design.',
          hint: 'This is the same limitation renderThemeGalleryPreview already has — see its own comment.',
        })
      },
      link: () => '#',
      'content.entry': async () => null,
      'content.byPath': async () => null,
      'content.list': async () => ({ items: [], nextCursor: null }),
    },
    // `runIsolatedModule`'s own default (2s) is sized for a quick plugin
    // capability call — a real preview does a genuine ESM import of the
    // theme (and `@cogenta/theme-kit`) plus a full serialize, which is
    // heavier under real filesystem/module-resolution cost. A longer
    // default here reflects that a preview is one explicit click (§ 3.3),
    // never a hot path a short timeout needs to protect.
    timeoutMs: options.timeoutMs ?? 8000,
  })

  if (!result.ok) {
    return { ok: false, error: result.error ?? 'The sandbox preview failed for an unknown reason.' }
  }

  const rendered = result.value as { header?: unknown; body?: unknown; footer?: unknown } | null
  if (
    rendered === null ||
    typeof rendered.header !== 'string' ||
    typeof rendered.body !== 'string' ||
    typeof rendered.footer !== 'string'
  ) {
    return {
      ok: false,
      error: 'The sandbox theme did not return the expected {header, body, footer} shape.',
    }
  }

  const styleTag = await previewStyleTag(options.projectRoot, dir)

  const html = `<!doctype html>
<html lang="en" dir="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeText(previewTitle(siteName))}</title>
${styleTag}
</head>
<body>
<a class="cg-skip-link" href="#cg-main">Skip to content</a>
${rendered.header}
${rendered.body}
${rendered.footer}
</body>
</html>
`
  return { ok: true, html }
}

/**
 * Fiche 73's own live E2E test: a preview with no CSS at all made every
 * sandbox look identical — plain, unstyled text — whether the agent had
 * written a real design or nothing, so nobody could tell the two apart
 * before deploying. Inlined here as a real `<style>` tag (never a `<link>`
 * to a route — the preview iframe's origin is `sandbox-preview.invalid`,
 * fiche 73 task 4's own deliberate database-free demo page, nothing it can
 * fetch a stylesheet from), same two layers a real page gets: the site's
 * own skin tokens as `--cogenta-*` custom properties on `:root` (read from
 * this project's own `theme.tokens.json` — a preview always previews
 * against the real, currently-configured colours/fonts, never invented
 * ones), then whatever `*.css` the sandbox has written on top, under any
 * name (`loadLocalThemeCss`'s own doc comment). Never a hard failure: a
 * project with no `theme.tokens.json` yet, or a sandbox with no CSS yet,
 * previews with whichever half it has.
 */
async function previewStyleTag(projectRoot: string, sandboxDir: string): Promise<string> {
  const parts: string[] = []

  try {
    const raw = await readFile(join(projectRoot, 'theme.tokens.json'), 'utf8')
    parts.push(renderSkin(JSON.parse(raw)).css)
  } catch {
    // No theme.tokens.json, or it does not validate — the sandbox's own
    // theme.css (below) still previews, just without real token values.
  }

  // No required file name — any `*.css` sitting in the sandbox root is
  // picked up (`loadLocalThemeCss`'s own doc comment), matching exactly
  // what a deployed theme resolves once it lands in `themes/<name>/`.
  const sandboxCss = await loadLocalThemeCss(sandboxDir, { read: (url) => readFile(url, 'utf8') })
  if (sandboxCss !== null) {
    parts.push(sandboxCss)
  } else {
    // No CSS written yet — an unstyled preview, honestly.
  }

  if (parts.length === 0) return ''
  return `<style>\n${parts.join('\n')}\n</style>`
}

function previewTitle(siteName: string): string {
  return `${siteName} — sandbox preview`
}

/** Lists the sandbox ids currently on disk — empty when `.cogenta/theme-sandbox/` does not exist yet, never an error (the same "opt-in, absence is the ordinary case" rule `filesystemThemeNames` already follows in `theme-registry.ts`). */
export async function listSandboxIds(projectRoot: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(join(projectRoot, SANDBOX_DIRECTORY), { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Task 5 — deploy pipeline (§ 3.4)
// ---------------------------------------------------------------------------

const THEMES_DIRECTORY = 'themes'
const THEME_VERSIONS_DIRECTORY = join(THEMES_DIRECTORY, '.versions')

export interface ThemeDeploymentCheck {
  readonly ok: boolean
  /**
   * Human-readable refusal reasons, empty when `ok`. Every reason here is a
   * genuine refusal, never a soft warning — `inspectTheme`/`verifyTheme`
   * (`@cogenta/render`, task 1) do not currently distinguish a "warning"
   * severity from a "refusal" one: every finding (a forbidden import, an
   * unreadable dynamic import, CommonJS) and a missing vocabulary block are
   * all refusal-grade today. The fiche's own § 3.4 step 3 anticipates a
   * future warnings-vs-refusals split in the admin display; this function
   * does not invent one that does not exist in the underlying scan — it
   * reports exactly what `verifyTheme` actually refuses, honestly, rather
   * than fabricating a "warnings" list that would always be empty.
   */
  readonly reasons: readonly string[]
}

/**
 * Steps 1-2 of § 3.4 — structure and security scan, reusing `verifyTheme`
 * (task 1, `@cogenta/render`) exactly as written rather than re-implementing
 * any part of it. Read-only: safe to call on every keystroke of a
 * confirmation screen without side effects, and called again by
 * `deployThemeFromSandbox` itself right before it ever touches `themes/` —
 * a check run once and trusted across the async gap of "a human reads the
 * result and clicks confirm" is a check that can go stale.
 */
const CONFIG_MODULE_CANDIDATES = ['theme.config.js', 'theme.config.mjs', 'theme.config.ts'] as const

/**
 * `loadTheme`'s own default `importManifest` has no cache-busting — the
 * right choice for an *installed* theme (`theme-registry.ts` memoizes on
 * top of it anyway, so a real site never re-imports the same theme twice in
 * one process), but exactly wrong for a sandbox: an agent editing the same
 * `theme.config.mjs` across several write-then-check cycles within one long
 * `cogenta serve` process would have every check after the first silently
 * re-validate whatever was on disk the *first* time this path was ever
 * imported — reporting the original failure forever, even after the file is
 * actually fixed. Live proof this was a real bug, not a hypothetical: an
 * agent's fix that made a sandbox's manifest genuinely complete kept being
 * reported as still missing every block, because this check had already
 * cached the pre-fix module. `loadTheme`'s `importManifest` option exists
 * precisely so a host that knows better about its own module loading can
 * override it — used here, rather than changing the shared default and
 * risking the production hot path.
 */
async function importManifestCacheBusted(root: string): Promise<unknown> {
  for (const file of CONFIG_MODULE_CANDIDATES) {
    const path = join(root, file)
    try {
      await access(path)
    } catch {
      continue
    }
    return import(`${pathToFileURL(path).href}?t=${randomUUID()}`)
  }
  throw new CogentaError({
    code: 'THEME_NOT_FOUND',
    message: `No theme manifest was found in ${root}.`,
    hint: `A theme root holds one of: ${CONFIG_MODULE_CANDIDATES.join(', ')}.`,
    details: { root, looked: CONFIG_MODULE_CANDIDATES },
  })
}

export async function checkThemeDeployment(
  projectRoot: string,
  id: string,
  themeName: string,
): Promise<ThemeDeploymentCheck> {
  const dir = sandboxDirectory(projectRoot, id)

  const renderModuleFile = await findRenderModuleFile(dir)
  if (renderModuleFile === undefined) {
    return {
      ok: false,
      reasons: ['No theme.render.{js,mjs,ts} file exists in this sandbox yet — nothing to deploy.'],
    }
  }

  try {
    await loadTheme({
      theme: { name: themeName, root: dir },
      verify: true,
      importManifest: importManifestCacheBusted,
    })
  } catch (error) {
    const message =
      error instanceof CogentaError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error)
    return { ok: false, reasons: [message] }
  }

  return { ok: true, reasons: [] }
}

export type ThemeDeploymentResult =
  | {
      readonly ok: true
      readonly themeDirectory: string
      /** `null` when nothing named `themeName` was already installed — the "new theme" deploy, not a redeploy. */
      readonly previousVersionDirectory: string | null
    }
  | { readonly ok: false; readonly reasons: readonly string[] }

/**
 * Step 4 (confirmation) is the caller's own responsibility — this function
 * is only called *after* a human has explicitly confirmed, never on its
 * own initiative (R6). What it does, in order, is steps 1-2 (re-checked,
 * never trusted from an earlier call), 5 (the copy, with the previous
 * version archived first — § 3.5 — rather than overwritten in place) and 6
 * (the theme is now installed and activable; activating it is a separate,
 * later gesture this function does not take).
 *
 * The archived copy is a real, recursive file copy under
 * `themes/.versions/<themeName>/<timestamp>/` — filesystem-safe timestamp
 * (no `:` — Windows, the platform this session runs on, refuses it in a
 * path), so a theme's history is plain files, no database needed for it
 * (§ 3.5's own reasoning). The old `themes/<themeName>/` is removed only
 * after that archive copy has completed, and the sandbox's own disposable
 * preview adapter file is never carried into the deployed theme.
 */
export async function deployThemeFromSandbox(
  projectRoot: string,
  id: string,
  themeName: string,
): Promise<ThemeDeploymentResult> {
  const check = await checkThemeDeployment(projectRoot, id, themeName)
  if (!check.ok) return { ok: false, reasons: check.reasons }

  const sandboxDir = sandboxDirectory(projectRoot, id)
  const destination = join(projectRoot, THEMES_DIRECTORY, themeName)

  const previousVersionDirectory = await archiveCurrentVersion(projectRoot, themeName)

  await mkdir(destination, { recursive: true })
  await cp(sandboxDir, destination, {
    recursive: true,
    filter: (source) => !source.endsWith(PREVIEW_ADAPTER_FILE),
  })
  // `theme-registry.ts`'s own cache has no other invalidation path — see its
  // doc comment on `invalidateFilesystemTheme` for the live bug this closes
  // (a name looked up, and cached as unresolvable, before this deploy would
  // otherwise stay invisible — to the gallery, and to `resolveTheme` itself
  // — for the rest of this `cogenta serve` process's life). `theme-css.ts`'s
  // stylesheet cache has the exact same shape of bug — a redeploy that adds
  // or edits `theme.css` must be visible on the very next page render, not
  // stuck on whatever (or nothing) this process read the first time it
  // rendered this theme.
  invalidateFilesystemTheme(themeName)
  invalidateThemeCss(themeName)

  return { ok: true, themeDirectory: destination, previousVersionDirectory }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** A filesystem-safe timestamp — no `:` (Windows refuses it in a path), same format `deployThemeFromSandbox` already uses. */
function versionTimestamp(): string {
  return new Date().toISOString().replaceAll(/[:.]/g, '-')
}

/**
 * If `themes/<themeName>/` currently exists, archives it into a fresh
 * `themes/.versions/<themeName>/<timestamp>/` and removes the original —
 * the same archive-then-remove ordering `deployThemeFromSandbox` already
 * uses, shared here rather than duplicated because restoring an old version
 * (below) needs the exact same "never overwrite in place" guarantee: a
 * restore is itself a deploy of different content, and undoing a mistaken
 * restore must be exactly as possible as undoing a mistaken deploy.
 */
async function archiveCurrentVersion(
  projectRoot: string,
  themeName: string,
): Promise<string | null> {
  const destination = join(projectRoot, THEMES_DIRECTORY, themeName)
  if (!(await pathExists(destination))) return null

  const archived = join(projectRoot, THEME_VERSIONS_DIRECTORY, themeName, versionTimestamp())
  await mkdir(archived, { recursive: true })
  await cp(destination, archived, { recursive: true })
  await rm(destination, { recursive: true, force: true })
  return archived
}

// ---------------------------------------------------------------------------
// Task 6 — versions: listing and restore (§ 3.5)
// ---------------------------------------------------------------------------

export interface ThemeVersionInfo {
  /** The archive's own directory name — a filesystem-safe timestamp, also this version's id for `restoreThemeVersion`. */
  readonly timestamp: string
  readonly directory: string
}

/** Every archived version of `themeName`, newest first — empty when the theme has never been redeployed or restored (no `.versions/<name>/` yet), never an error. */
export async function listThemeVersions(
  projectRoot: string,
  themeName: string,
): Promise<readonly ThemeVersionInfo[]> {
  const dir = join(projectRoot, THEME_VERSIONS_DIRECTORY, themeName)
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ timestamp: entry.name, directory: join(dir, entry.name) }))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  } catch {
    return []
  }
}

export type ThemeRestoreResult =
  | {
      readonly ok: true
      readonly themeDirectory: string
      /** The version that was active just before this restore, archived in turn — `null` only when `themes/<themeName>/` did not exist at all. */
      readonly archivedCurrentDirectory: string | null
    }
  | { readonly ok: false; readonly reasons: readonly string[] }

/**
 * Recopies an archived version over `themes/<themeName>/` — "même geste
 * conceptuel que le retour arrière déjà existant pour les mises à jour de
 * flotte" (§ 3.5): a named, listed past state, restored on an explicit
 * human gesture, never automatically. Not re-scanned by `verifyTheme` before
 * restoring: this version already passed that check the moment it was first
 * deployed (`deployThemeFromSandbox`), and nothing else in this module ever
 * writes into `themes/.versions/` — an archive is not a place live edits
 * happen. The currently active version is archived first, exactly like a
 * fresh deploy, so a restore is itself undoable rather than a one-way door.
 */
export async function restoreThemeVersion(
  projectRoot: string,
  themeName: string,
  timestamp: string,
): Promise<ThemeRestoreResult> {
  const versionDir = join(projectRoot, THEME_VERSIONS_DIRECTORY, themeName, timestamp)
  if (!(await pathExists(versionDir))) {
    return {
      ok: false,
      reasons: [`No archived version "${timestamp}" exists for theme "${themeName}".`],
    }
  }

  const archivedCurrentDirectory = await archiveCurrentVersion(projectRoot, themeName)

  const destination = join(projectRoot, THEMES_DIRECTORY, themeName)
  await mkdir(destination, { recursive: true })
  await cp(versionDir, destination, { recursive: true })
  // Same real bug `deployThemeFromSandbox` closes above — a restore changes
  // `themes/<name>/` just as much as a deploy does.
  invalidateFilesystemTheme(themeName)
  invalidateThemeCss(themeName)

  return { ok: true, themeDirectory: destination, archivedCurrentDirectory }
}

export type ThemeDeleteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasons: readonly string[] }

/**
 * Fiche "supprimer un thème" — the one destructive action this file did not
 * yet have: every other operation here (deploy, restore) only ever *adds* a
 * new state to keep around, never removes one for good. A real folder under
 * `themes/<name>/` only, never a built-in — `theme-registry.ts`'s own
 * `filesystemThemeNames()` already refuses to let a local folder shadow a
 * built-in package's name, so this function can never reach one by
 * construction; a name that resolves to no folder here (a built-in, or a
 * typo) is refused with the same honest reason either way.
 *
 * Genuinely complete, matching what the admin's own confirmation warns
 * about: both `themes/<name>/` (the live deployed code) and
 * `themes/.versions/<name>/` (every archived version `restoreThemeVersion`
 * could otherwise still bring back) are removed — a theme deleted this way
 * really does disappear entirely, not just "until someone restores an old
 * version". Whether the deleted theme was the site's own `activeTheme`, and
 * clearing that override if so, is the caller's job (`serve.ts`'s route
 * handler) — this function only ever touches the filesystem, the same
 * boundary every other function in this file already keeps.
 */
export async function deleteTheme(projectRoot: string, name: string): Promise<ThemeDeleteResult> {
  const destination = join(projectRoot, THEMES_DIRECTORY, name)
  if (!(await pathExists(destination))) {
    return {
      ok: false,
      reasons: [`No local theme named "${name}" exists in this project's themes/ folder.`],
    }
  }

  await rm(destination, { recursive: true, force: true })
  await rm(join(projectRoot, THEME_VERSIONS_DIRECTORY, name), { recursive: true, force: true })
  // Same live-process-cache bug class as a deploy/restore — a name this
  // process already resolved (even to "found") must not keep answering that
  // way once the folder behind it is gone.
  invalidateFilesystemTheme(name)
  invalidateThemeCss(name)

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Task 7 — writing a single file into a sandbox (§ 3.6)
// ---------------------------------------------------------------------------

function pathEscapeError(sandboxDir: string, relativePath: string): CogentaError {
  return new CogentaError({
    code: 'THEME_SANDBOX_PATH_ESCAPE',
    message: `"${relativePath}" resolves outside the sandbox directory.`,
    hint: 'A sandbox file path is always relative to the sandbox root — it can never use ".." to leave it.',
    details: { sandboxDir, relativePath },
  })
}

/**
 * Resolves `relativePath` against `sandboxDir`, refusing anything that
 * escapes it — a `../../.env` or an absolute path handed to
 * `theme.write_sandbox_file` by a model (or by a prompt-injection payload
 * hiding inside a document the agent read, R8) must never land outside the
 * one sandbox directory it was scoped to. The same class of check task 8
 * (zip import) will need for the same reason (piège n°3, § 6) — written
 * once here since this is the first real caller.
 *
 * Purely lexical (`resolve` + `startsWith`), on purpose fast and
 * dependency-free — but a lexical check alone cannot see a symlink already
 * sitting inside the sandbox (security review, fiche 73 task 7): a link a
 * cloned theme happened to carry (`cloneThemeIntoSandbox` copies a symlink
 * as a symlink, never dereferencing it) could point outside the sandbox
 * while every path segment still resolves, lexically, underneath it.
 * `assertNoSymlinkEscape` below is the real-filesystem half of this guard;
 * this function alone is not the full story.
 */
function resolveWithinSandbox(sandboxDir: string, relativePath: string): string {
  const root = resolve(sandboxDir)
  const target = resolve(root, relativePath)
  if (target !== root && !target.startsWith(root + sep)) {
    throw pathEscapeError(sandboxDir, relativePath)
  }
  return target
}

/**
 * Walks every path segment between `sandboxDir` and `target`, refusing if
 * any segment that already exists on disk is a symlink — closing the gap
 * `resolveWithinSandbox`'s lexical check cannot see: a pre-existing symlink
 * inside the sandbox pointing outside it, which the OS would happily follow
 * at the real `writeFile`/`rm` even though every path segment "looks" like
 * it resolves inside the sandbox. A segment that does not exist yet is not
 * a symlink to anything — nothing further to check past the first missing
 * one, since the filesystem is hierarchical and `mkdir`/`writeFile` will
 * only ever create real directories and files under it.
 */
async function assertNoSymlinkEscape(sandboxDir: string, target: string): Promise<void> {
  const root = resolve(sandboxDir)
  const segments = target === root ? [] : target.slice(root.length + 1).split(sep)
  let current = root
  for (const segment of segments) {
    current = join(current, segment)
    let stats: Awaited<ReturnType<typeof lstat>>
    try {
      stats = await lstat(current)
    } catch {
      return
    }
    if (stats.isSymbolicLink()) {
      throw pathEscapeError(sandboxDir, target.slice(root.length + 1))
    }
  }
}

/** The combined guard both `writeSandboxFile` and `deleteSandboxFile` use — lexical resolution, then a real-filesystem symlink check. */
async function resolveRealPathWithinSandbox(
  sandboxDir: string,
  relativePath: string,
): Promise<string> {
  const target = resolveWithinSandbox(sandboxDir, relativePath)
  await assertNoSymlinkEscape(sandboxDir, target)
  return target
}

/**
 * Writes one file into a sandbox — task 7's real deliverable, and what
 * `theme.write_sandbox_file` (`@cogenta/agents-builtin`) actually calls.
 * Creates the sandbox directory itself if it does not exist yet (so a first
 * write can also be the thing that starts a new sandbox), and any
 * intermediate subdirectory the path names. Refuses to overwrite the
 * sandbox's own disposable preview-adapter file (task 4) — a real name
 * collision would silently vanish the moment the next preview regenerates
 * it, confusing rather than dangerous, but there is no reason to allow it.
 * The reserved-file check compares *resolved* paths, not the raw string, so
 * `./`-prefixed or otherwise differently-spelled equivalents are caught the
 * same way (security review, fiche 73 task 7 — a raw string comparison here
 * missed exactly this).
 */
const CONFIG_MODULE_NAME = /^theme\.config\.(m?js|ts)$/u
const RENDER_MODULE_NAME = /^theme\.render\.(m?js|ts)$/u
/**
 * A real, live-observed agent mistake, not a hypothetical: a model asked to
 * write `theme.render.*` named its file `theme.render.tsx` — plausible-
 * sounding (TypeScript, "renders JSX"), and CONFIG_MODULE_NAME/
 * RENDER_MODULE_NAME above silently ignore it (neither regex matches, so
 * `validateSandboxModuleWrite` returns early as if the file were unrelated to
 * the manifest/render module at all). The write itself still succeeds — the
 * sandbox now has a real-looking file nothing ever imports, since `.tsx`
 * needs a JSX transform this loader (a plain `import()`, no build step) does
 * not have and never will. The preview then fails with the generic "no
 * theme.render.{js,mjs,ts} yet" message, which does not explain *why* a file
 * that is clearly right there was never found — a dead end for the very
 * self-correction loop this whole file exists to support. Caught here
 * instead, with the specific, actionable reason.
 */
const NEAR_MISS_CONFIG_NAME = /^theme\.config\.(?!m?js$|ts$)[^.]+$/u
const NEAR_MISS_RENDER_NAME = /^theme\.render\.(?!m?js$|ts$)[^.]+$/u

/**
 * Real feedback, not a prompt: fiche 73 task 7's own live E2E test (an actual
 * gpt-5-mini session, twice) showed a model asked to write these two files
 * inventing a `ThemeManifest`/`RenderContext` shape that only superficially
 * resembles the real one — `blocks` as an array of block names instead of the
 * block-vocabulary semver range it actually is, `tokens` as inline token data
 * instead of the path string it actually is, `runtime` as an object instead of
 * one of three literal strings, a `ctx.theme.tokens` a real `RenderContext`
 * has never had (skin tokens are CSS custom properties applied separately by
 * `renderSkin`, never JS values a render module reads). A better tool
 * *description* alone did not fix this — improving it is still worth doing,
 * but the durable fix is the one this codebase already uses everywhere else
 * for a model-authored artifact (contract A entries via
 * `collectionInputSchema`, contract D skins via `validateSkin`): reject a
 * write that doesn't validate, with the *real* error, and let the agent loop
 * try again — never let invalid contract-D source ship into a sandbox
 * silently, only to fail later at preview or deploy with no path back to what
 * was actually wrong.
 *
 * `theme.config.*`'s own `defineTheme()` call already throws `THEME_INVALID`
 * with a precise, field-by-field message the instant the module loads — this
 * only needs to actually load it. `theme.render.*` has no such built-in
 * check, so this does the minimum a real theme module must satisfy: export
 * `renderPage` and `renderChrome` as callables. Import is cache-busted with
 * a fresh id per call so editing a file already written earlier in the same
 * process re-validates the new content, not a stale cached module.
 */
async function validateSandboxModuleWrite(
  projectRoot: string,
  id: string,
  target: string,
  relativePath: string,
): Promise<void> {
  const basename = relativePath.split(/[/\\]/u).pop() ?? relativePath
  const isConfig = CONFIG_MODULE_NAME.test(basename)
  const isRender = RENDER_MODULE_NAME.test(basename)
  if (!isConfig && !isRender) {
    if (NEAR_MISS_CONFIG_NAME.test(basename) || NEAR_MISS_RENDER_NAME.test(basename)) {
      throw new CogentaError({
        code: 'THEME_SANDBOX_FILE_INVALID',
        message: `"${relativePath}" is not a recognised theme module file name.`,
        hint: 'theme.config.* and theme.render.* must use exactly one of these extensions: .js, .mjs or .ts — never .tsx or .jsx. Nothing transforms JSX in this sandbox (no build step, a plain ESM import()), so write plain h()-based code instead.',
        details: { relativePath },
      })
    }
    return
  }

  let imported: Record<string, unknown>
  try {
    // `?t=` alone collided under fast, sub-millisecond-apart rewrites in the
    // same process (two calls landing in the same `Date.now()` millisecond
    // resolve to the same cached module — the second write's own validation
    // then silently ran against the *first* write's already-cached content).
    // `randomUUID()` never repeats within a process, cache-busting for real.
    imported = (await import(`${pathToFileURL(target).href}?t=${randomUUID()}`)) as Record<
      string,
      unknown
    >
  } catch (error) {
    throw new CogentaError({
      code: 'THEME_SANDBOX_FILE_INVALID',
      message: `"${relativePath}" failed to load: ${error instanceof Error ? error.message : String(error)}`,
      hint: isConfig
        ? 'theme.config.* must be an ES module whose default export is the result of defineTheme({...}) from @cogenta/theme-kit — see that error for which field is wrong.'
        : 'theme.render.* must be an ES module that imports { h } from @cogenta/theme-kit and exports renderPage and renderChrome.',
      details: { relativePath },
    })
  }

  if (isConfig) {
    // `defineTheme` (re-exported from `@cogenta/render`) already validated
    // the manifest at module-evaluation time above; parsing again here would
    // only repeat work `import` already did. What is left to check is the
    // shape `import` cannot: that the module actually has a default export
    // to have been the manifest at all (e.g. `export const config = ...`
    // instead of `export default ...`).
    if (imported.default === undefined) {
      throw new CogentaError({
        code: 'THEME_SANDBOX_FILE_INVALID',
        message: `"${relativePath}" has no default export.`,
        hint: 'theme.config.* must `export default defineTheme({...})` — a named export is never read.',
        details: { relativePath },
      })
    }
    // Re-validates the already-evaluated object — this is what actually
    // catches a raw `export default {...}` (no `defineTheme()` call at all,
    // so nothing validated it at import time) as well as a `defineTheme()`
    // call whose own throw this function's `catch` above already reports.
    // Wrapped in this function's own error code so every rejection this
    // write can produce is consistently `THEME_SANDBOX_FILE_INVALID`.
    try {
      parseThemeManifest(imported.default, relativePath)
    } catch (error) {
      throw new CogentaError({
        code: 'THEME_SANDBOX_FILE_INVALID',
        message: error instanceof Error ? error.message : String(error),
        hint: 'theme.config.* must `export default defineTheme({...})` from @cogenta/theme-kit, with every contract D manifest field — see that error for which one is wrong.',
        details: { relativePath },
      })
    }
  } else {
    const missing = ['renderPage', 'renderChrome'].filter(
      (name) => typeof imported[name] !== 'function',
    )
    if (missing.length > 0) {
      throw new CogentaError({
        code: 'THEME_SANDBOX_FILE_INVALID',
        message: `"${relativePath}" does not export ${missing.map((name) => `${name}()`).join(' and ')} as a function.`,
        hint: "theme.render.* must export both renderPage(page, ctx, options) and renderChrome(input) — see @cogenta/theme-kit's RenderContext.",
        details: { relativePath, missing },
      })
    }

    // Exporting two functions is necessary but nowhere near sufficient —
    // fiche 73's own live E2E test showed a model write a `renderPage` that
    // returns a plain data object shaped like a wishful "template payload"
    // instead of the `HtmlElement` tree `serialize()` (`@cogenta/theme-kit`)
    // actually requires, and a `renderChrome` returning `{site, header,
    // footer}` instead of the `{header, footer}` strings a real chrome
    // point requires — both exported functions, both silently wrong, and
    // both would only have surfaced at the *next* preview click, with no
    // path back to this write for the agent that made it. Running the exact
    // same real preview this sandbox's own "Aperçu" button runs — same
    // isolated worker, same demo page and chrome input, same `serialize()`
    // call — is the only check that actually proves this module renders,
    // rather than merely exists.
    const preview = await renderSandboxPreview({ projectRoot, id })
    if (!preview.ok) {
      throw new CogentaError({
        code: 'THEME_SANDBOX_FILE_INVALID',
        message: `"${relativePath}" does not render: ${preview.error}`,
        hint: "renderPage must return an HtmlElement built with h() from @cogenta/theme-kit (not a plain data object), and renderChrome must return { header, footer } as HTML strings — see @cogenta/theme-kit's RenderContext and serialize().",
        details: { relativePath },
      })
    }
  }
}

export async function writeSandboxFile(
  projectRoot: string,
  id: string,
  relativePath: string,
  /** A string for ordinary text-file writes (the agent tool, task 7); a `Buffer` for task 8's zip import, which must not assume every entry is UTF-8 text. */
  content: string | Buffer,
): Promise<{ readonly path: string }> {
  const dir = sandboxDirectory(projectRoot, id)
  const target = await resolveRealPathWithinSandbox(dir, relativePath)
  if (target === resolveWithinSandbox(dir, PREVIEW_ADAPTER_FILE)) {
    throw new CogentaError({
      code: 'THEME_SANDBOX_PATH_ESCAPE',
      message: `"${PREVIEW_ADAPTER_FILE}" is reserved for the sandbox's own preview mechanism.`,
      hint: 'Choose a different file name — this one is regenerated automatically on every preview.',
      details: { relativePath },
    })
  }
  const previousContent = await readFile(target).catch(() => undefined)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content)
  try {
    await validateSandboxModuleWrite(projectRoot, id, target, relativePath)
  } catch (error) {
    // Reject, don't ship: restore whatever was there before (or remove the
    // file if this was its first write) so a rejected write never leaves the
    // sandbox in a half-invalid state the agent's next call would build on
    // top of.
    if (previousContent === undefined) await rm(target, { force: true })
    else await writeFile(target, previousContent)
    throw error
  }
  return { path: relativePath }
}

/** `revert`'s counterpart — deletes one file previously written by `writeSandboxFile`. A file that is already gone is not an error (`force: true`): reverting twice, or reverting after a human already deleted it by hand, both succeed. */
export async function deleteSandboxFile(
  projectRoot: string,
  id: string,
  relativePath: string,
): Promise<void> {
  const dir = sandboxDirectory(projectRoot, id)
  const target = await resolveRealPathWithinSandbox(dir, relativePath)
  await rm(target, { force: true })
}
