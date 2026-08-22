import { CogentaError } from '@cogenta/core'
import type {
  ChromeInput,
  ChromeResult,
  FetchedEntries,
  HtmlElement,
  PageContent,
  RenderContext,
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
  ) => HtmlElement
  readonly renderChrome: (input: ChromeInput) => ChromeResult
}

export interface BuiltinTheme {
  readonly name: string
  readonly label: string
  readonly description: string
  readonly load: () => Promise<ThemeModule>
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
    description:
      'The reference theme: all twelve blocks, zero client JavaScript, a neutral, accessible default.',
    load: () => import('@cogenta/theme-canonical'),
  },
  {
    name: '@cogenta/theme-ecommerce',
    label: 'Storefront',
    description:
      'A confident, product-grid-native storefront: shoppable cards, a bold CTA accent, zero client JavaScript.',
    load: () => import('@cogenta/theme-ecommerce'),
  },
  {
    name: '@cogenta/theme-portfolio',
    label: 'Portfolio',
    description:
      'An ultra-modern creative-portfolio theme: brutalist-meets-editorial display type, an electric accent, zero client JavaScript.',
    load: () => import('@cogenta/theme-portfolio'),
  },
  {
    name: '@cogenta/theme-entreprise',
    label: 'Entreprise',
    description:
      'A confident, premium B2B theme: structured typography, real KPI/impact sections, a genuine dark mode.',
    load: () => import('@cogenta/theme-entreprise'),
  },
]

export const DEFAULT_THEME_NAME = '@cogenta/theme-canonical'

const BY_NAME = new Map(BUILTIN_THEMES.map((theme) => [theme.name, theme]))

/** Every theme this instance can offer — what the appearance screen's picker lists. */
export function availableThemes(): readonly { name: string; label: string; description: string }[] {
  return BUILTIN_THEMES.map(({ name, label, description }) => ({ name, label, description }))
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
