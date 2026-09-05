import type { BlockRegistry } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import type { ThemeManifest } from '@cogenta/render'
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
    name: '@cogenta/theme-association',
    label: 'Association',
    load: () => import('@cogenta/theme-association'),
    loadManifest: () => import('@cogenta/theme-association/theme.config'),
  },
]

export const DEFAULT_THEME_NAME = '@cogenta/theme-canonical'

const BY_NAME = new Map(BUILTIN_THEMES.map((theme) => [theme.name, theme]))

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

/** Every theme this instance can offer — what the appearance screen's picker lists. */
export async function availableThemes(): Promise<readonly AvailableThemeInfo[]> {
  return Promise.all(
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
}

const loaded = new Map<string, Promise<ThemeModule>>()

/**
 * Resolves the active theme by name, defaulting to
 * `@cogenta/theme-canonical` for `null`/`undefined`/an unrecognised name — a
 * site whose stored `activeTheme` names a theme this build no longer ships
 * (an uninstalled package, a typo restored from a backup) still serves,
 * rather than refusing every request, which is what R1/R2's "never let an
 * optional feature take the whole site down" spirit asks for here.
 *
 * Each theme's module is imported once and cached for the life of the
 * process (Node's own ESM cache would do this anyway; the `Map` here just
 * keys it by name instead of by specifier, and is what lets a second call
 * with a different name resolve without waiting on the first).
 */
export function resolveTheme(name: string | null | undefined): Promise<ThemeModule> {
  const theme =
    (name !== null && name !== undefined ? BY_NAME.get(name) : undefined) ??
    BY_NAME.get(DEFAULT_THEME_NAME)
  if (theme === undefined) {
    throw new CogentaError({
      code: 'THEME_NOT_FOUND',
      message: 'No theme is registered, not even the built-in default.',
      hint: 'This is a packaging error in @cogenta/cli, not a site configuration problem.',
    })
  }
  const cached = loaded.get(theme.name)
  if (cached !== undefined) return cached
  const promise = theme.load()
  loaded.set(theme.name, promise)
  return promise
}
