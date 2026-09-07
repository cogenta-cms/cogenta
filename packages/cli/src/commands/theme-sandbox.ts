import { access, cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CogentaError } from '@cogenta/core'
import { runIsolatedModule } from '@cogenta/plugins'
import { loadTheme } from '@cogenta/render'
import { escapeText } from '@cogenta/theme-kit'

/**
 * Fiche 73 tasks 4-5 — the sandbox itself (create, clone, isolated preview —
 * task 4), and the deploy pipeline that promotes one into `themes/<name>/`
 * (task 5, § 3.4). Writing to a sandbox file is a separate concern (task 7's
 * agent tool, or the developer's own editor, per the fiche's explicit "pas
 * d'éditeur de fichiers dans l'admin pour cette fiche").
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

  const html = `<!doctype html>
<html lang="en" dir="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeText(previewTitle(siteName))}</title>
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
    await loadTheme({ theme: { name: themeName, root: dir }, verify: true })
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

  let previousVersionDirectory: string | null = null
  if (await pathExists(destination)) {
    const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-')
    previousVersionDirectory = join(projectRoot, THEME_VERSIONS_DIRECTORY, themeName, timestamp)
    await mkdir(previousVersionDirectory, { recursive: true })
    await cp(destination, previousVersionDirectory, { recursive: true })
    await rm(destination, { recursive: true, force: true })
  }

  await mkdir(destination, { recursive: true })
  await cp(sandboxDir, destination, {
    recursive: true,
    filter: (source) => !source.endsWith(PREVIEW_ADAPTER_FILE),
  })

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
