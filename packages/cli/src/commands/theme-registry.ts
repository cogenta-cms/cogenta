import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { BlockRegistry } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import { loadTheme, type ThemeManifest } from '@cogenta/render'
import type {
  ChromeInput,
  ChromeResult,
  FetchedEntries,
  HtmlElement,
  PageContent,
  RenderContext,
  TermArchiveInput,
} from '@cogenta/theme-kit'

/**
 * The theme registry — what makes more than one theme package installable at
 * all (fiche L23). Before this, `theme-render.ts` imported `renderPage` and
 * the chrome markup directly from `@cogenta/theme-canonical`; every site ran
 * that one theme because nothing else could be named.
 *
 * A theme package's two theme-specific exports — everything else a rendered
 * page needs (`RenderContext`, escaping, rich text, comments, entry helpers)
 * now lives in `@cogenta/theme-kit`, shared and identical across every theme,
 * so `theme-render.ts` never has to ask the registry for it.
 */
export interface ThemeModule {
  readonly renderPage: (
    page: PageContent,
    ctx: RenderContext,
    entries?: FetchedEntries,
    /**
     * The block registry a stored block's type is resolved against —
     * `@cogenta/blocks`'s twelve-turned-seventeen by default. A site with
     * blocks of its own (a theme, or a theme-shipping plugin) passes its own,
     * wider registry, so an active theme that does not implement one of them
     * still renders its declared `fallback` (fiche 43, sous-chantier C(ii))
     * instead of a silently blank slot.
     */
    registry?: BlockRegistry,
  ) => HtmlElement
  readonly renderChrome: (input: ChromeInput) => ChromeResult
  /**
   * The public archive page of one taxonomy term (contract D `theme@1.3`).
   *
   * **Optional**, and that is the whole point of it being here rather than
   * beside `renderPage`: a theme installed before this existed, or a theme
   * that simply does not want to own this layout, keeps working — the host
   * renders a plain list inside that theme's own chrome instead. Making it
   * required would have turned a new capability into a breaking change for
   * every theme package on the day it shipped.
   */
  readonly renderTermArchive?: (input: TermArchiveInput) => HtmlElement
}

export interface BuiltinTheme {
  readonly name: string
  /** The gallery's own display name — not part of the manifest (fiche 48: a theme package does not get to name the card it is shown on). */
  readonly label: string
  readonly load: () => Promise<ThemeModule>
  /** Loads `<package>/theme.config` — the manifest, separate from `load()` so a card can show version/description/author without pulling in the whole render module. */
  readonly loadManifest: () => Promise<{ readonly default: ThemeManifest }>
}

/**
 * The theme packages this build of `@cogenta/cli` ships with — a real npm
 * dependency of this package, never a filesystem scan: `cogenta serve` runs
 * from a project that installed `@cogenta/cli`, and every theme it can offer
 * has to be something that installation actually has in `node_modules`.
 *
 * Adding a theme package is one entry here, matched by one line in this
 * package's own `dependencies` — the same "declare it once, the registry
 * generalises the rest" shape `SITE_SETTINGS_REGISTRY` already uses for site
 * settings.
 */
export const BUILTIN_THEMES: readonly BuiltinTheme[] = [
  {
    name: '@cogenta/theme-canonical',
    label: 'Canonical',
    load: () => import('@cogenta/theme-canonical'),
    loadManifest: () => import('@cogenta/theme-canonical/theme.config'),
  },
  {
    name: '@cogenta/theme-ecommerce',
    label: 'Storefront',
    load: () => import('@cogenta/theme-ecommerce'),
    loadManifest: () => import('@cogenta/theme-ecommerce/theme.config'),
  },
  {
    name: '@cogenta/theme-portfolio',
    label: 'Portfolio',
    load: () => import('@cogenta/theme-portfolio'),
    loadManifest: () => import('@cogenta/theme-portfolio/theme.config'),
  },
  {
    name: '@cogenta/theme-entreprise',
    label: 'Entreprise',
    load: () => import('@cogenta/theme-entreprise'),
    loadManifest: () => import('@cogenta/theme-entreprise/theme.config'),
  },
  {
    name: '@cogenta/theme-magazine',
    label: 'Magazine',
    load: () => import('@cogenta/theme-magazine'),
    loadManifest: () => import('@cogenta/theme-magazine/theme.config'),
  },
  {
    name: '@cogenta/theme-blog',
    label: 'Blog',
    load: () => import('@cogenta/theme-blog'),
    loadManifest: () => import('@cogenta/theme-blog/theme.config'),
  },
  {
    name: '@cogenta/theme-saas',
    label: 'SaaS',
    load: () => import('@cogenta/theme-saas'),
    loadManifest: () => import('@cogenta/theme-saas/theme.config'),
  },
  {
    name: '@cogenta/theme-docs',
    label: 'Documentation',
    load: () => import('@cogenta/theme-docs'),
    loadManifest: () => import('@cogenta/theme-docs/theme.config'),
  },
  {
    name: '@cogenta/theme-restaurant',
    label: 'Restaurant',
    load: () => import('@cogenta/theme-restaurant'),
    loadManifest: () => import('@cogenta/theme-restaurant/theme.config'),
  },
  {
    name: '@cogenta/theme-association',
    label: 'Association',
    load: () => import('@cogenta/theme-association'),
    loadManifest: () => import('@cogenta/theme-association/theme.config'),
  },
]

export const DEFAULT_THEME_NAME = '@cogenta/theme-canonical'

const BY_NAME = new Map(BUILTIN_THEMES.map((theme) => [theme.name, theme]))

/**
 * The name of the directory `cogenta serve` scans for a site's own themes,
 * relative to the project root — fiche 73. `<projectRoot>/themes/<name>/` is
 * the exact shape a `create-cogenta` scaffold already has file access to;
 * nothing new to teach an operator about *where* things live.
 */
const THEMES_DIRECTORY = 'themes'

/** The theme's render module — the manifest lives beside it as `theme.config.*` (unchanged). */
const RENDER_MODULE_FILES = ['theme.render.js', 'theme.render.mjs', 'theme.render.ts'] as const

/**
 * Set once, at boot (`runServe`), never reassigned mid-process — the same
 * "configure once, module-level state carries it" shape this file already
 * uses for `manifestCache`/`loaded` below. A `projectRoot` is fixed for the
 * lifetime of one `cogenta serve` process, so threading it as a parameter
 * through every render call site (`theme-render.ts`, `term-archive-page.ts`,
 * `theme-wiring.ts`, …) would be plumbing with no behavioural difference from
 * reading it here once.
 *
 * `undefined` (the default, e.g. in every test that never calls
 * `configureThemeRegistry`) means "skip the filesystem lookup entirely" —
 * `resolveTheme`/`availableThemes` behave exactly as they did before fiche
 * 73, byte for byte, for any caller that never opts in.
 */
let configuredProjectRoot: string | undefined

export function configureThemeRegistry(options: { readonly projectRoot: string }): void {
  configuredProjectRoot = options.projectRoot
}

interface FilesystemTheme {
  readonly module: ThemeModule
  readonly manifest: ThemeManifest
}

const filesystemThemeCache = new Map<string, Promise<FilesystemTheme | undefined>>()

/**
 * Looks up `<projectRoot>/themes/<name>/`, never anywhere else — a name that
 * is not a real directory there, or whose structure does not validate,
 * resolves to `undefined` rather than throwing: the caller (`resolveTheme`)
 * already has a well-established "unrecognised name falls back to the
 * default theme" behaviour (R1/R2 — an optional feature never takes a whole
 * site down), and a malformed local theme deserves the exact same treatment
 * as a typo'd or uninstalled one, not a harder failure. Task 5 of fiche 73
 * (the sandbox's deploy pipeline) is where a broken theme gets a loud,
 * specific error *before* it can ever become `activeTheme` — this function
 * stays quiet on purpose.
 */
async function loadFilesystemTheme(name: string): Promise<FilesystemTheme | undefined> {
  const root = configuredProjectRoot
  if (root === undefined) return undefined

  const cached = filesystemThemeCache.get(name)
  if (cached !== undefined) return cached

  const promise = (async (): Promise<FilesystemTheme | undefined> => {
    const themeRoot = join(root, THEMES_DIRECTORY, name)
    let manifest: ThemeManifest
    try {
      // `loadTheme`'s own search order already includes `themes/` (fiche 73
      // § 1's discovery — it was already there, just never called by
      // `cogenta serve`), so `cwd: root` alone resolves `<root>/themes/<name>`
      // without this file needing to know that order itself.
      //
      // `verify: true` is not optional here, unlike the built-in themes'
      // load path above (which skips it — an npm-packaged theme already
      // went through `cogenta theme install` before it ever shipped). A
      // theme dropped straight into `themes/` has been through no such
      // gate; contract D's isolation promise ("un thème tourne sans secrets
      // et sans connexion base — vérifié, pas une convention") is what
      // `verifyTheme` enforces, and it must run before this file ever
      // `import()`s the theme's own code into this process. `verifyTheme`
      // throws on a forbidden import or a missing vocabulary block, which
      // the catch below turns into the same "fall back to the default
      // theme" outcome as any other structural defect — task 5's sandbox
      // deploy pipeline is where this becomes a *visible* refusal with a
      // named reason; this path only ever needs to refuse quietly.
      manifest = (await loadTheme({ theme: { name }, cwd: root, verify: true })).manifest
    } catch {
      return undefined
    }

    const renderModule = await importFirstExisting(themeRoot, RENDER_MODULE_FILES)
    if (renderModule === undefined) return undefined
    if (!isThemeModule(renderModule)) return undefined

    return { module: renderModule, manifest }
  })()

  filesystemThemeCache.set(name, promise)
  return promise
}

async function importFirstExisting(
  root: string,
  candidates: readonly string[],
): Promise<unknown | undefined> {
  for (const file of candidates) {
    try {
      return await import(pathToFileURL(join(root, file)).href)
    } catch (error) {
      if (isModuleNotFoundAt(error, join(root, file))) continue
      return undefined
    }
  }
  return undefined
}

function isModuleNotFoundAt(error: unknown, path: string): boolean {
  const code = (error as { code?: unknown } | null)?.code
  if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') return true
  // Node on Windows reports a missing file:// target with the raw path in
  // the message rather than always setting `code` — same fallback
  // `loadCollections` already needed (L9), not a new inconsistency.
  return typeof (error as { message?: unknown } | null)?.message === 'string'
    ? (error as { message: string }).message.includes(path)
    : false
}

function isThemeModule(value: unknown): value is ThemeModule {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.renderPage === 'function' && typeof record.renderChrome === 'function'
}

/** One entry of the appearance screen's theme gallery (fiche 48) — everything a card shows about a theme. */
export interface AvailableThemeInfo {
  readonly name: string
  readonly label: string
  /**
   * `manifest.description`, when the theme declares one — the manifest is
   * the source of truth (fiche 48 task 3: editing `theme.config.ts` alone
   * changes this, no change to this file needed). Falls back to `label`
   * for a theme that predates `theme@1.2` or simply omits `description`.
   */
  readonly description: string
  /** `manifest.version` — the theme contract's own version, not the npm package version (two different numbers; this is the one contract D already models). */
  readonly version: string
  /** `manifest.author`, or `null` for a theme that does not declare one. */
  readonly author: string | null
}

const manifestCache = new Map<string, Promise<ThemeManifest>>()

function loadManifestOf(theme: BuiltinTheme): Promise<ThemeManifest> {
  const cached = manifestCache.get(theme.name)
  if (cached !== undefined) return cached
  const promise = theme.loadManifest().then((mod) => mod.default)
  manifestCache.set(theme.name, promise)
  return promise
}

/**
 * Directory names under `<projectRoot>/themes/` — each one is *tried* as a
 * theme name, not assumed to be one. A folder that fails to load or does not
 * validate as a `ThemeModule` is silently left out of the list (fiche 73 § 1:
 * only the theme an operator actually activates should ever surface a loud
 * error; a stray non-theme directory here — a README, a `.git`, a half
 * -written experiment — is not an error to report, just nothing to offer).
 */
async function filesystemThemeNames(): Promise<readonly string[]> {
  const root = configuredProjectRoot
  if (root === undefined) return []
  try {
    const entries = await readdir(join(root, THEMES_DIRECTORY), { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return [] // no `themes/` directory at all is the ordinary case, not a problem to report
  }
}

/** Every theme this instance can offer — what the appearance screen's picker lists. */
export async function availableThemes(): Promise<readonly AvailableThemeInfo[]> {
  const builtin = Promise.all(
    BUILTIN_THEMES.map(async (theme) => {
      const manifest = await loadManifestOf(theme)
      return {
        name: theme.name,
        label: theme.label,
        description: manifest.description ?? theme.label,
        version: manifest.version,
        author: manifest.author ?? null,
      }
    }),
  )

  const names = await filesystemThemeNames()
  const local = Promise.all(
    names
      // A folder named after a built-in theme never shadows the real
      // package (fiche 73, piège n°4) — the npm-based entry above already
      // owns that name.
      .filter((name) => !BY_NAME.has(name))
      .map(async (name): Promise<AvailableThemeInfo | undefined> => {
        const loaded = await loadFilesystemTheme(name)
        if (loaded === undefined) return undefined
        return {
          name,
          label: name,
          description: loaded.manifest.description ?? name,
          version: loaded.manifest.version,
          author: loaded.manifest.author ?? null,
        }
      }),
  )

  const [builtinInfos, localInfos] = await Promise.all([builtin, local])
  return [...builtinInfos, ...localInfos.filter((info) => info !== undefined)]
}

const loaded = new Map<string, Promise<ThemeModule>>()

/**
 * Resolves the active theme by name, defaulting to
 * `@cogenta/theme-canonical` for `null`/`undefined`/an unrecognised name — a
 * site whose stored `activeTheme` names a theme this build no longer ships
 * (an uninstalled package, a typo restored from a backup), **or** a folder
 * under `themes/` that does not validate, still serves, rather than
 * refusing every request, which is what R1/R2's "never let an optional
 * feature take the whole site down" spirit asks for here.
 *
 * Each theme's module is imported once and cached for the life of the
 * process (Node's own ESM cache would do this anyway; the `Map` here just
 * keys it by name instead of by specifier, and is what lets a second call
 * with a different name resolve without waiting on the first).
 */
export async function resolveTheme(name: string | null | undefined): Promise<ThemeModule> {
  const builtin = name !== null && name !== undefined ? BY_NAME.get(name) : undefined
  if (builtin !== undefined) return resolveBuiltinTheme(builtin)

  if (name !== null && name !== undefined) {
    const local = await loadFilesystemTheme(name)
    if (local !== undefined) return local.module
  }

  const fallback = BY_NAME.get(DEFAULT_THEME_NAME)
  if (fallback === undefined) {
    throw new CogentaError({
      code: 'THEME_NOT_FOUND',
      message: 'No theme is registered, not even the built-in default.',
      hint: 'This is a packaging error in @cogenta/cli, not a site configuration problem.',
    })
  }
  return resolveBuiltinTheme(fallback)
}

function resolveBuiltinTheme(theme: BuiltinTheme): Promise<ThemeModule> {
  const cached = loaded.get(theme.name)
  if (cached !== undefined) return cached
  const promise = theme.load()
  loaded.set(theme.name, promise)
  return promise
}
