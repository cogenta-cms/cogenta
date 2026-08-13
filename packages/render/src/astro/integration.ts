import type { AstroIntegration } from 'astro'
import type { RenderConfig } from '../config.js'
import { type LoadedTheme, type LoadThemeOptions, loadTheme } from '../theme/load-theme.js'

/**
 * The Astro integration that puts the active theme in front of Astro.
 *
 * Astro is the theme engine by ADR-0008, so this is where the configuration's
 * `theme.name` becomes something Vite can resolve. Two things are exposed and
 * no more:
 *
 * - the alias `@theme`, pointing at the theme's `src/`, so that a site's pages
 *   import `@theme/layouts/Base.astro` and a theme swap is a configuration
 *   change rather than a rewrite of every import;
 * - the virtual module `virtual:cogenta/theme`, holding the manifest and the
 *   site block of the configuration.
 *
 * What is *not* exposed matters as much: the content token, the database URL
 * and the rest of the Cogenta configuration never enter Vite's module graph,
 * because everything in it is reachable from theme code.
 */

export const THEME_ALIAS = '@theme'
export const THEME_VIRTUAL_MODULE = 'virtual:cogenta/theme'

const RESOLVED_VIRTUAL_MODULE = `\0${THEME_VIRTUAL_MODULE}`

export interface CogentaIntegrationOptions {
  readonly config: RenderConfig
  /** Directory the theme is resolved from. Astro's project root by default. */
  readonly cwd?: string | undefined
  /**
   * Run the installation check before the build starts.
   *
   * Off by default because `cogenta theme install` already refused a theme
   * that fails it; on for a site that installs themes out of band and wants
   * the guarantee at build time too.
   */
  readonly verify?: boolean | undefined
  readonly importManifest?: LoadThemeOptions['importManifest']
}

/** What the theme exposes to the site, serialised into the virtual module. */
export interface ThemeModule {
  readonly manifest: LoadedTheme['manifest']
  readonly site: RenderConfig['site']
}

export function cogentaTheme(options: CogentaIntegrationOptions): AstroIntegration {
  return {
    name: '@cogenta/render',
    hooks: {
      'astro:config:setup': async ({ config, updateConfig, logger }) => {
        const theme = await loadTheme({
          theme: options.config.theme,
          cwd: options.cwd ?? fileSystemPath(config.root),
          importManifest: options.importManifest,
          verify: options.verify ?? false,
        })

        logger.info(
          `theme ${theme.manifest.name}@${theme.manifest.version} (runtime: ${theme.manifest.runtime})`,
        )

        updateConfig({
          vite: {
            plugins: [themeVirtualModule({ manifest: theme.manifest, site: options.config.site })],
            resolve: {
              alias: { [THEME_ALIAS]: `${theme.root}/src` },
            },
          },
        })
      },
    },
  }
}

/** Astro hands roots as `URL`s; Vite wants paths. */
function fileSystemPath(root: URL | string): string {
  const href = typeof root === 'string' ? root : root.href
  if (!href.startsWith('file:')) return href
  const path = decodeURIComponent(new URL(href).pathname)
  // A Windows path arrives as `/C:/…`; the leading slash is not part of it.
  return /^\/[A-Za-z]:/u.test(path) ? path.slice(1) : path
}

interface MinimalVitePlugin {
  readonly name: string
  resolveId(id: string): string | undefined
  load(id: string): string | undefined
}

/**
 * Serialises the theme into a module the site can import.
 *
 * `JSON.stringify` rather than a builder: the manifest came from a third-party
 * theme, and generating code from untrusted values is how a manifest becomes
 * an injection.
 */
export function themeVirtualModule(module: ThemeModule): MinimalVitePlugin {
  return {
    name: 'cogenta:theme',
    resolveId: (id) => (id === THEME_VIRTUAL_MODULE ? RESOLVED_VIRTUAL_MODULE : undefined),
    load: (id) =>
      id === RESOLVED_VIRTUAL_MODULE
        ? `export const manifest = ${JSON.stringify(module.manifest)}\n` +
          `export const site = ${JSON.stringify(module.site)}\n`
        : undefined,
  }
}
