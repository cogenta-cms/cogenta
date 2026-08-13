import { stat } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CogentaError } from '@cogenta/core'
import type { ThemeConfig } from '../config.js'
import { parseThemeManifest, type ThemeManifest } from './manifest.js'
import { type ThemeInspection, verifyTheme } from './verify/verify-theme.js'

/**
 * Loading the active theme named by the configuration.
 *
 * The manifest is a file the site owner installed from somewhere else, so it
 * is parsed and validated, never spread into the render context as-is.
 */

export interface LoadedTheme {
  readonly manifest: ThemeManifest
  /** Absolute path to the theme root. */
  readonly root: string
  /** Present only when the installation check ran. */
  readonly inspection?: ThemeInspection | undefined
}

export interface LoadThemeOptions {
  readonly theme: ThemeConfig
  /** Directory the theme is resolved from. `process.cwd()` by default. */
  readonly cwd?: string | undefined
  /**
   * Reads the manifest module out of a theme root.
   *
   * Injectable because the host owns module loading: Astro loads
   * `theme.config.ts` through Vite, a Node CLI loads the built `.js`, and a
   * test loads a fixture. The default covers the last two.
   */
  readonly importManifest?: ((root: string) => Promise<unknown>) | undefined
  /**
   * Run the installation check (contract D). Off by default: this is what
   * `cogenta theme install` does once, not what booting a site does on every
   * start.
   */
  readonly verify?: boolean | undefined
}

/** Manifest file names, in the order they are tried. */
const MANIFEST_FILES = ['theme.config.js', 'theme.config.mjs', 'theme.config.ts'] as const

/** Where a theme is looked for when the configuration gives no explicit root. */
const THEME_DIRECTORIES = ['node_modules', 'themes', 'packages', '.'] as const

export async function loadTheme(options: LoadThemeOptions): Promise<LoadedTheme> {
  const cwd = options.cwd ?? process.cwd()
  const root = await resolveThemeRoot(options.theme, cwd)
  const load = options.importManifest ?? importManifestFile

  const module = await load(root)
  // The manifest's `name` is not checked against `theme.name`: the
  // configuration names a package or a directory, the manifest names the
  // theme, and they are two namespaces. `canonical-theme` shipping a theme
  // called `canonical` is ordinary, not a mistake to refuse.
  const manifest = parseThemeManifest(exportedManifest(module, root), root)

  if (options.verify !== true) return { manifest, root }
  return { manifest, root, inspection: await verifyTheme({ root, manifest }) }
}

/** The manifest a theme module exports, under either accepted name. */
function exportedManifest(module: unknown, root: string): unknown {
  if (typeof module !== 'object' || module === null) {
    throw new CogentaError({
      code: 'THEME_INVALID',
      message: `The theme manifest in ${root} exports nothing usable.`,
      hint: 'A theme.config file exports its manifest as `theme`, or as the default export.',
      details: { root },
    })
  }
  const record = module as Record<string, unknown>
  return record.theme ?? record.default ?? record
}

async function resolveThemeRoot(theme: ThemeConfig, cwd: string): Promise<string> {
  if (theme.root !== undefined) {
    const root = isAbsolute(theme.root) ? theme.root : resolve(cwd, theme.root)
    if (await isDirectory(root)) return root
    throw new CogentaError({
      code: 'THEME_NOT_FOUND',
      message: `The theme root "${theme.root}" does not exist.`,
      hint: `Resolved from ${cwd}. Point theme.root at the directory holding theme.config, or drop it to resolve the theme as a package.`,
      details: { theme: theme.name, root, cwd },
    })
  }

  const tried: string[] = []
  for (const directory of THEME_DIRECTORIES) {
    const candidate = join(cwd, directory, theme.name)
    tried.push(candidate)
    if (await isDirectory(candidate)) return candidate
  }

  throw new CogentaError({
    code: 'THEME_NOT_FOUND',
    message: `No theme named "${theme.name}" was found.`,
    hint: `Install it, or set theme.root to its directory. Looked in: ${tried.join(', ')}.`,
    details: { theme: theme.name, tried, cwd },
  })
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function importManifestFile(root: string): Promise<unknown> {
  for (const file of MANIFEST_FILES) {
    const path = join(root, file)
    try {
      if (!(await stat(path)).isFile()) continue
    } catch {
      continue
    }
    try {
      return await import(pathToFileURL(path).href)
    } catch (error) {
      throw new CogentaError({
        code: 'THEME_INVALID',
        message: `The theme manifest ${path} could not be loaded.`,
        hint: 'A manifest loaded outside a bundler must be plain JavaScript, or TypeScript on a Node that strips types. Ship a built theme.config.js, or load the theme through Astro.',
        cause: error,
        details: { root, file },
      })
    }
  }

  throw new CogentaError({
    code: 'THEME_NOT_FOUND',
    message: `No theme manifest was found in ${root}.`,
    hint: `A theme root holds one of: ${MANIFEST_FILES.join(', ')}.`,
    details: { root, looked: MANIFEST_FILES },
  })
}
